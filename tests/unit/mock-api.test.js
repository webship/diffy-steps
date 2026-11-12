'use strict';

// Checks that the mock Diffy API behaves like the documented API, so the
// suite that runs against it means something. Run with: npm run test:unit

const test = require('node:test');
const assert = require('node:assert');
const { createMock } = require('../support/mock-diffy-api/server');

// A 1x1 PNG, and a second one that differs.
const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

let mock;
let base;
let token;

test.before(async () => {
  mock = createMock({ stageMs: 40 });
  base = await mock.listen();
  const res = await fetch(base + 'auth/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: mock.apiKey }) });
  token = (await res.json()).token;
});
test.after(() => mock.close());

const call = (method, path, body, headers = {}) => fetch(base + path, {
  method,
  headers: Object.assign({ Authorization: `Bearer ${token}` }, body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}, headers),
  body: body instanceof FormData ? body : body && JSON.stringify(body),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function upload(name, images, extra = {}) {
  const form = new FormData();
  form.append('snapshotName', name);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  images.forEach(({ buffer, url, breakpoint }, i) => {
    form.append(`files[${i}]`, new Blob([buffer], { type: 'image/png' }), `shot-${i}.png`);
    form.append(`urls[${i}]`, url);
    form.append(`breakpoints[${i}]`, String(breakpoint));
  });
  return form;
}

async function poll(path, done) {
  for (let i = 0; i < 100; i++) {
    const data = await (await call('GET', path)).json();
    if (done(data)) return data;
    await sleep(20);
  }
  throw new Error(`${path} never reached the expected state`);
}

test('auth/key answers a token for a known key, 401 for an unknown key, 403 without API access', async () => {
  const post = (key) => fetch(base + 'auth/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  assert.strictEqual((await post('nope')).status, 401);
  const noAccess = await post(mock.noApiAccessKey);
  assert.strictEqual(noAccess.status, 403);
  assert.strictEqual((await noAccess.json()).type, 'api_access_disabled');
  assert.ok((await (await post(mock.apiKey)).json()).token);
});

test('every other route needs a bearer token, and an expired token is refused', async () => {
  assert.strictEqual((await fetch(base + 'projects/1001')).status, 401);
  assert.strictEqual((await call('GET', 'projects/1001')).status, 200);
  mock.expireTokens();
  const expired = await call('GET', 'projects/1001');
  assert.strictEqual(expired.status, 401);
  assert.strictEqual((await expired.json()).message, 'Expired JWT Token');
  const res = await fetch(base + 'auth/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: mock.apiKey }) });
  token = (await res.json()).token;
  assert.strictEqual((await call('GET', 'projects/1001')).status, 200);
});

test('an unknown project, screenshot or diff answers 404', async () => {
  assert.strictEqual((await call('GET', 'projects/1')).status, 404);
  assert.strictEqual((await call('GET', 'snapshots/1')).status, 404);
  assert.strictEqual((await call('GET', 'diffs/1')).status, 404);
});

test('an upload is validated: image type, counts, URLs outside the project, functional-test flag', async () => {
  const bad = await call('POST', 'projects/1001/create-custom-snapshot', upload('x', [{ buffer: Buffer.from('not an image'), url: '/', breakpoint: 640 }]));
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await bad.json()).type, 'validation_error');

  const form = upload('x', [{ buffer: PNG_A, url: '/', breakpoint: 640 }]);
  form.append('urls[1]', '/extra');
  assert.strictEqual((await call('POST', 'projects/1001/create-custom-snapshot', form)).status, 400);

  const outside = upload('x', [{ buffer: PNG_A, url: '/not-in-project', breakpoint: 640 }]);
  const refused = await call('POST', 'projects/1001/create-custom-snapshot', outside);
  assert.strictEqual(refused.status, 400);
  assert.match((await refused.json()).errors[0], /not in the project settings/);

  const functional = upload('x', [{ buffer: PNG_A, url: '/not-in-project', breakpoint: 640 }], { functionalTest: '1' });
  const ok = await call('POST', 'projects/1001/create-custom-snapshot', functional);
  assert.strictEqual(ok.status, 200);
  assert.ok(Number.isInteger(await ok.json()));
});

test('an uploaded screenshot is polled through its states, a diff of different images changes', async () => {
  const a = await (await call('POST', 'projects/1001/create-custom-snapshot', upload('a', [{ buffer: PNG_A, url: '/', breakpoint: 640 }]))).json();
  const b = await (await call('POST', 'projects/1001/create-custom-snapshot', upload('b', [{ buffer: PNG_B, url: '/', breakpoint: 640 }]))).json();
  const first = await (await call('GET', `snapshots/${a}`)).json();
  assert.strictEqual(first.state, 1);
  assert.strictEqual(first.name, 'a');
  await poll(`snapshots/${a}`, (d) => d.state === 2);

  const diffId = await (await call('POST', 'projects/1001/diffs', { snapshot1: a, snapshot2: b, name: 'ab' })).json();
  assert.ok(Number.isInteger(diffId));
  const early = await (await call('GET', `diffs/${diffId}`)).json();
  assert.ok([1, 5].includes(early.state), `unexpected early state ${early.state}`);
  assert.strictEqual(early.result, 0);
  const done = await poll(`diffs/${diffId}`, (d) => [2, 3, 4].includes(d.state));
  assert.strictEqual(done.name, 'ab');
  assert.ok(done.result > 0);
  assert.ok(done.diffSharedUrl);
  assert.ok(Number(done.diffs['/']['640'].percentageChanges) > 0);
});

test('a diff of identical images has no changes', async () => {
  const a = await (await call('POST', 'projects/1001/create-custom-snapshot', upload('a', [{ buffer: PNG_A, url: '/', breakpoint: 640 }]))).json();
  const b = await (await call('POST', 'projects/1001/create-custom-snapshot', upload('b', [{ buffer: PNG_A, url: '/', breakpoint: 640 }]))).json();
  const diffId = await (await call('POST', 'projects/1001/diffs', { snapshot1: a, snapshot2: b })).json();
  const done = await poll(`diffs/${diffId}`, (d) => d.state >= 2 && d.state !== 5);
  assert.strictEqual(done.result, 0);
  assert.strictEqual(done.diffs['/']['640'].percentageChanges, '0');
});

test('a diff needs two screenshots of the project', async () => {
  const res = await call('POST', 'projects/1001/diffs', { snapshot1: 1, snapshot2: 2 });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await call('POST', 'projects/1001/diffs', { snapshot1: 'x' })).status, 400);
});

test('a remote screenshot goes through every state, and needs a URL for the custom environment', async () => {
  const id = await (await call('POST', 'projects/1001/screenshots', { environment: 'production' })).json();
  const seen = new Set();
  await poll(`snapshots/${id}`, (d) => { seen.add(d.state); return d.state === 4; });
  assert.ok(seen.has(2) || seen.has(3), 'completed state never seen');
  assert.strictEqual((await call('POST', 'projects/1001/screenshots', { environment: 'custom' })).status, 400);
  assert.strictEqual((await call('POST', 'projects/1001/screenshots', { environment: 'development' })).status, 400);
  assert.strictEqual((await call('POST', 'projects/1001/screenshots', { environment: 'prod' })).status, 400);
  assert.strictEqual((await call('POST', 'projects/1001/screenshots', { environment: 'custom', baseUrl: 'https://example.net' })).status, 200);
});

test('compare answers the diff id as a string and tells environments apart', async () => {
  const same = await (await call('POST', 'projects/1001/compare', { env1: 'prod', env2: 'prod' })).json();
  assert.strictEqual(typeof same, 'string');
  const unchanged = await poll(`diffs/${same}`, (d) => d.state >= 2 && d.state !== 5);
  assert.strictEqual(unchanged.result, 0);

  const other = await (await call('POST', 'projects/1001/compare', { env1: 'prod', env2: 'stage', name: 'release' })).json();
  const changed = await poll(`diffs/${other}`, (d) => d.state >= 2 && d.state !== 5);
  assert.strictEqual(changed.result, 100);
  assert.strictEqual(changed.name, 'release');

  assert.strictEqual((await call('POST', 'projects/1001/compare', { env1: 'prod', env2: 'custom' })).status, 400);
  assert.strictEqual((await call('POST', 'projects/1001/compare', { env1: 'prod', env2: 'custom', env2Url: 'https://example.net' })).status, 200);
  assert.strictEqual((await call('POST', 'projects/1001/compare', { env1: 'prod', env2: 'moon' })).status, 400);
  assert.strictEqual((await call('POST', 'projects/1001/compare', { env1: 'prod', env2: 'baseline' })).status, 400);
});

test('a screenshot set can become the baseline, and the baseline can be compared', async () => {
  const id = await (await call('POST', 'projects/1001/screenshots', { environment: 'production' })).json();
  assert.strictEqual((await call('PUT', 'projects/1001/set-base-line-set/99999')).status, 404);
  assert.strictEqual((await call('PUT', `projects/1001/set-base-line-set/${id}`)).status, 200);
  assert.strictEqual((await (await call('GET', `snapshots/${id}`)).json()).baseline, true);
  assert.strictEqual((await call('POST', 'projects/1001/compare', { env1: 'baseline', env2: 'prod' })).status, 200);
});

test('a diff can be held in a stopped state, and failures can be injected', async () => {
  const a = await (await call('POST', 'projects/1001/create-custom-snapshot', upload('a', [{ buffer: PNG_A, url: '/', breakpoint: 640 }]))).json();
  mock.forceNextDiffState(-1);
  const diffId = await (await call('POST', 'projects/1001/diffs', { snapshot1: a, snapshot2: a })).json();
  assert.strictEqual((await (await call('GET', `diffs/${diffId}`)).json()).state, -1);

  mock.inject({ method: 'GET', pattern: /\/diffs\/\d+$/, status: 429, times: 1, headers: { 'Retry-After': '1' } });
  const limited = await call('GET', `diffs/${diffId}`);
  assert.strictEqual(limited.status, 429);
  assert.strictEqual(limited.headers.get('retry-after'), '1');
  assert.strictEqual((await call('GET', `diffs/${diffId}`)).status, 200);
});

test('appending images to a screenshot is accepted with PUT and with POST', async () => {
  const id = await (await call('POST', 'projects/1001/create-custom-snapshot', upload('a', [{ buffer: PNG_A, url: '/', breakpoint: 640 }]))).json();
  for (const method of ['PUT', 'POST']) {
    const res = await call(method, `snapshots/${id}`, upload('a', [{ buffer: PNG_B, url: '/diffy/baseline.html', breakpoint: 640 }]));
    assert.strictEqual(res.status, 200, method);
    assert.strictEqual((await res.json()).id, id);
  }
});
