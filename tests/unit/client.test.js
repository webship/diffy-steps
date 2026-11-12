'use strict';

// Checks the Diffy client against the mock: authentication, retries, errors,
// polling and uploads. Run with: npm run test:unit

const test = require('node:test');
const assert = require('node:assert');
const { createMock } = require('../support/mock-diffy-api/server');
const { DiffyClient, resolveConfig, toId, retryDelay, clearTokens, changedPages, summarize } = require('../step-definitions/diffy-client');

const { solidPng } = require('../support/mock-diffy-api/png');

const PNG = solidPng(16, 16, [10, 20, 30]);
const OTHER_PNG = solidPng(16, 16, [200, 100, 50]);

let mock;
let baseUrl;
test.before(async () => {
  mock = createMock({ stageMs: 20 });
  baseUrl = await mock.listen();
});
test.after(() => mock.close());
test.beforeEach(() => {
  mock.reset();
  clearTokens();
});

function client(overrides = {}, deps = {}) {
  const waits = [];
  const cfg = Object.assign(resolveConfig({}), { apiKey: mock.apiKey, projectId: 1001, baseUrl, maxWait: 5, pollInterval: 0.02 }, overrides);
  return Object.assign(new DiffyClient(cfg, Object.assign({ sleep: async (ms) => { waits.push(ms); } }, deps)), { waits });
}
const images = (n, extra = {}) => Array.from({ length: n }, (_, i) => Object.assign({ buffer: PNG, url: `/page-${i}`, breakpoint: 640, filename: `p${i}.png`, contentType: 'image/png' }, extra));
const rejects = (promise, pattern) => assert.rejects(promise, (e) => { assert.match(e.message, pattern); return true; });
const called = (method, pattern) => mock.requests.filter((r) => r.method === method && pattern.test(r.path));

test('a missing API key or project id says which variable to set', async () => {
  await rejects(client({ apiKey: '' }).createScreenshot('production'), /DIFFY_API_KEY[\s\S]*app\.diffy\.website\/#\/keys/);
  await rejects(client({ projectId: 0 }).createScreenshot('production'), /DIFFY_PROJECT_ID/);
});

test('a wrong key answers what Diffy said and where to get a key', async () => {
  const error = await client({ apiKey: 'wrong' }).createScreenshot('production').catch((e) => e);
  assert.match(error.message, /did not accept the API key/);
  assert.match(error.message, /Unknown key/);
  assert.match(error.message, /Hint:.*#\/keys/);
  assert.strictEqual(error.status, 401);
});

test('an account without API access is told so', async () => {
  await rejects(client({ apiKey: mock.noApiAccessKey }).createScreenshot('production'), /no API access[\s\S]*paid plan or a coupon/);
});

test('an expired token is renewed once and the call succeeds', async () => {
  const c = client();
  await c.createScreenshot('production');
  mock.expireTokens();
  const id = await c.createScreenshot('staging');
  assert.ok(id > 0);
  assert.strictEqual(called('POST', /^auth\/key$/).length, 2);
});

test('a token that stays refused fails with a hint after one renewal', async () => {
  const c = client();
  await c.createScreenshot('production');
  mock.inject({ method: 'POST', pattern: /\/screenshots$/, status: 401, times: 2 });
  await rejects(c.createScreenshot('production'), /refused the bearer token[\s\S]*DIFFY_API_KEY/);
  assert.strictEqual(called('POST', /^auth\/key$/).length, 2);
});

test('an unknown project says to check DIFFY_PROJECT_ID', async () => {
  await rejects(client({ projectId: 5 }).createScreenshot('production'), /nothing at POST projects\/5\/screenshots[\s\S]*DIFFY_PROJECT_ID \(now 5\)/);
});

test('a screenshot or diff that does not exist says where the id came from', async () => {
  await rejects(client().getScreenshot(1), /screenshot set id comes from an earlier step/);
  await rejects(client().getDiff(1), /comparison id comes from an earlier step/);
});

test('validation errors show what Diffy rejected', async () => {
  await rejects(client().createScreenshot('development'), /rejected POST projects\/1001\/screenshots[\s\S]*no development URL/);
});

test('429 waits for Retry-After and retries; after three retries it fails with a hint', async () => {
  const c = client();
  const id = await c.createScreenshot('production');
  mock.inject({ method: 'GET', pattern: /\/snapshots\/\d+$/, status: 429, times: 1, headers: { 'Retry-After': '2' } });
  assert.ok((await c.getScreenshot(id)).state >= 0);
  assert.deepStrictEqual(c.waits, [2000]);

  const d = client();
  mock.inject({ method: 'GET', pattern: /\/snapshots\/\d+$/, status: 429, times: 10 });
  await rejects(d.getScreenshot(id), /limiting the number of requests[\s\S]*DIFFY_POLL_INTERVAL/);
  assert.deepStrictEqual(d.waits, [1000, 2000, 4000]);
});

test('a GET is retried on 503, a request that changes something is not', async () => {
  const c = client();
  const id = await c.createScreenshot('production');
  mock.inject({ method: 'GET', pattern: /\/snapshots\/\d+$/, status: 503, times: 2 });
  await c.getScreenshot(id);
  assert.strictEqual(called('GET', /^snapshots\//).length, 3);

  mock.inject({ method: 'POST', pattern: /\/screenshots$/, status: 503, times: 1 });
  const before = called('POST', /screenshots$/).length;
  await rejects(c.createScreenshot('production'), /answered 503 for POST projects\/1001\/screenshots[\s\S]*few minutes/);
  assert.strictEqual(called('POST', /screenshots$/).length, before + 1);
});

test('an unreachable Diffy says so and names the address', async () => {
  await rejects(client({ baseUrl: 'http://127.0.0.1:1/api/' }).createScreenshot('production'), /Could not reach Diffy[\s\S]*DIFFY_API_BASE_URL \(now http:\/\/127\.0\.0\.1:1\/api\/\)/);
});

test('ids are read from a number, a numeric string or an object, and nothing else', () => {
  assert.strictEqual(toId(7001, 'x'), 7001);
  assert.strictEqual(toId('9002', 'x'), 9002);
  assert.strictEqual(toId({ id: 5 }, 'x'), 5);
  for (const bad of ['', 'abc', 0, -3, 1.5, null, {}, { id: 'x' }]) assert.throws(() => toId(bad, 'comparison'), /did not answer a comparison id/);
});

test('Retry-After is read as seconds or as a date, and capped', () => {
  assert.strictEqual(retryDelay('3', 0), 3000);
  assert.strictEqual(retryDelay(null, 2), 4000);
  assert.strictEqual(retryDelay('9999', 0), 60000);
  assert.ok(retryDelay(new Date(Date.now() + 5000).toUTCString(), 0) <= 5000);
});

test('the custom environment needs a URL before any request is made', async () => {
  const c = client();
  await rejects(c.createScreenshot('custom'), /custom environment needs a URL/);
  await rejects(c.compare('prod', 'custom', {}), /Environment 2 is "custom"[\s\S]*DIFFY_ENV2_URL/);
  await rejects(c.createScreenshot('moon'), /not an environment Diffy can take screenshots from/);
  await rejects(c.compare('prod', 'moon'), /not an environment Diffy can compare/);
  assert.strictEqual(mock.requests.length, 0);
});

test('compare sends the documented fields: names, custom URL, credentials, commit SHA', async () => {
  const c = client();
  const id = await c.compare('production', 'custom', { name: 'pr-42', env2Url: 'https://pr-42.example.org', env2User: 'u', env2Pass: 'p', commitSha: 'abc123' });
  assert.ok(id > 0);
  const sent = JSON.parse(called('POST', /compare$/)[0].raw.toString());
  assert.deepStrictEqual(sent, { env1: 'prod', env2: 'custom', env2Url: 'https://pr-42.example.org', env2CredsMode: true, env2CredsUser: 'u', env2CredsPass: 'p', name: 'pr-42', commitSha: 'abc123' });
});

test('a custom environment screenshot sends its base URL', async () => {
  const c = client();
  await c.createScreenshot('custom', 'https://stage.example.org');
  assert.deepStrictEqual(JSON.parse(called('POST', /screenshots$/)[0].raw.toString()), { environment: 'custom', baseUrl: 'https://stage.example.org' });
});

test('a diff of two uploads completes and reports a change; the same images report none', async () => {
  const c = client();
  const a = await c.uploadSnapshot('a', images(1, { url: '/' }), { functionalTest: true });
  const b = await c.uploadSnapshot('b', [{ buffer: OTHER_PNG, url: '/', breakpoint: 640, filename: 'b.png', contentType: 'image/png' }], { functionalTest: true });
  const same = await c.uploadSnapshot('a2', images(1, { url: '/' }), { functionalTest: true });
  const changed = await c.waitForDiff(await c.createDiff(a, b, 'ab'));
  assert.ok(changed.result > 0);
  assert.strictEqual(changed.name, 'ab');
  assert.match(summarize(1, changed), /% of the pages changed.*Report: /);
  assert.strictEqual(changedPages(changed).length, 1);
  const unchanged = await c.waitForDiff(await c.createDiff(a, same));
  assert.strictEqual(unchanged.result, 0);
  assert.match(summarize(1, unchanged), /no changes found/);
});

test('a stopped diff fails at once; a diff that never finishes fails after DIFFY_MAX_WAIT with its state', async () => {
  const c = client();
  const a = await c.uploadSnapshot('a', images(1), { functionalTest: true });
  mock.forceNextDiffState(-1);
  const stopped = await c.createDiff(a, a);
  await rejects(c.waitForDiff(stopped), /Comparison \d+ did not finish: it is stopped/);

  let clock = 0;
  const slow = client({ maxWait: 1, pollInterval: 0.4 }, { now: () => clock, sleep: async (ms) => { clock += ms; } });
  mock.forceNextDiffState(1);
  const stuck = await slow.createDiff(a, a);
  await rejects(slow.waitForDiff(stuck), /did not finish within 1 s[\s\S]*last state 1[\s\S]*DIFFY_MAX_WAIT/);
});

test('a screenshot set is waited for until it is complete', async () => {
  const c = client({ pollInterval: 0.01 }, { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  const id = await c.createScreenshot('production');
  const data = await c.waitForScreenshot(id);
  assert.ok([2, 3, 4].includes(data.state));
  mock.forceSnapshotState(id, -1);
  await rejects(c.waitForScreenshot(id), /Screenshot set \d+ did not finish: it is stopped/);
});

test('uploads outside the project URL list need the functional-test flag', async () => {
  const c = client();
  await rejects(c.uploadSnapshot('x', images(1), { functionalTest: false }), /not in the project settings/);
  assert.ok(await c.uploadSnapshot('x', images(1), { functionalTest: true }));
});

test('more than ten images are sent in batches: the first creates the set, the rest are appended with PUT', async () => {
  const c = client();
  const id = await c.uploadSnapshot('many', images(25), { functionalTest: true });
  assert.ok(id > 0);
  assert.strictEqual(called('POST', /create-custom-snapshot$/).length, 1);
  assert.strictEqual(called('PUT', new RegExp(`^snapshots/${id}$`)).length, 2);
});

test('appending falls back to POST when the PUT route is not there', async () => {
  const c = client();
  mock.inject({ method: 'PUT', pattern: /\/snapshots\/\d+$/, status: 405, times: 5 });
  const id = await c.uploadSnapshot('many', images(11), { functionalTest: true });
  assert.strictEqual(called('POST', new RegExp(`^snapshots/${id}$`)).length, 1);
});

test('a screenshot set can be made the baseline', async () => {
  const c = client();
  const id = await c.createScreenshot('production');
  await c.setBaseline(id);
  assert.strictEqual(called('PUT', /set-base-line-set\//).length, 1);
  await rejects(c.setBaseline(1), /nothing at PUT projects\/1001\/set-base-line-set\/1/);
});

test('settings resolve from the environment first, then the worldParameters, then the defaults', () => {
  const saved = { ...process.env };
  try {
    for (const name of Object.keys(process.env)) if (name.startsWith('DIFFY_')) delete process.env[name];
    const defaults = resolveConfig({});
    assert.strictEqual(defaults.baseUrl, 'https://app.diffy.website/api/');
    assert.strictEqual(defaults.maxWait, 1200);
    assert.strictEqual(defaults.functionalTest, true);
    assert.deepStrictEqual(defaults.breakpoints, [1200]);

    const fromParameters = resolveConfig({ diffy: { projectId: 7, breakpoints: '320, 640,abc', baseUrl: 'http://localhost:1/api', functionalTest: false } });
    assert.strictEqual(fromParameters.projectId, 7);
    assert.deepStrictEqual(fromParameters.breakpoints, [320, 640]);
    assert.strictEqual(fromParameters.baseUrl, 'http://localhost:1/api/');
    assert.strictEqual(fromParameters.functionalTest, false);

    process.env.DIFFY_PROJECT_ID = '99';
    process.env.DIFFY_FUNCTIONAL_TEST = 'true';
    process.env.DIFFY_MAX_WAIT = '30';
    const fromEnvironment = resolveConfig({ diffy: { projectId: 7, functionalTest: false } });
    assert.strictEqual(fromEnvironment.projectId, 99);
    assert.strictEqual(fromEnvironment.functionalTest, true);
    assert.strictEqual(fromEnvironment.maxWait, 30);
  } finally {
    for (const name of Object.keys(process.env)) if (name.startsWith('DIFFY_')) delete process.env[name];
    Object.assign(process.env, saved);
  }
});
