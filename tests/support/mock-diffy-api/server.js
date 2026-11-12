'use strict';

// A local mock of the Diffy REST API, for running this repository's suite
// without a Diffy account.
//
// What it follows (see fixtures.js for the sources):
//   - the routes, request bodies and response shapes of the published Swagger
//     (https://app.diffy.website/rest/swagger.json),
//   - bearer authentication: POST auth/key exchanges a key for a token that
//     expires, every other route needs it and answers 401 without it,
//   - the screenshot and diff states of the official Diffy PHP client, which a
//     caller has to poll through: nothing is complete the moment it is created,
//   - a result computed from the images: two snapshots whose images match give
//     0 percent, otherwise the share of changed pages.
//
// What it does not do: render anything. Images are only hashed. Remote
// screenshots (environments) are hashed from their environment and URL, so
// "prod against prod" is unchanged and "prod against stage" is changed.
//
// Only the routes the steps use are served. Anything else answers 404.

const crypto = require('crypto');
const http = require('http');
const { parseMultipart } = require('./multipart');
const { SNAPSHOT_STATE, DIFF_STATE, fullProject, fullScreenshot, fullDiff } = require('./fixtures');

const API_KEY = 'mock-key';
const NO_API_ACCESS_KEY = 'mock-key-without-api-access';
const TOKEN_TTL_MS = 60 * 60 * 1000;
const ENV_TO_FIELD = { prod: 'production', stage: 'staging', dev: 'development' };
const SCREENSHOT_ENVIRONMENTS = ['production', 'staging', 'development', 'custom'];
const COMPARE_ENVIRONMENTS = ['prod', 'stage', 'dev', 'baseline', 'custom'];

/**
 * The project every mock server starts with. The three example pages of this
 * repository are in its URL list, so uploads that are not marked as
 * functional-test uploads are accepted for them.
 *
 * @returns {object}
 */
function defaultProject() {
  return {
    id: 1001,
    name: 'Example project',
    urls: ['/', '/diffy/baseline.html', '/diffy/changed.html'],
    breakpoints: [640, 1200],
    production: 'https://www.example.org',
    staging: 'https://stage.example.org',
    development: '',
    baselineSnapshotId: null,
  };
}

const sha1 = (value) => crypto.createHash('sha1').update(value).digest('hex');

function isPositiveInteger(value) {
  return (typeof value === 'number' && Number.isInteger(value) && value > 0)
    || (typeof value === 'string' && /^[1-9]\d*$/.test(value));
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Create a mock Diffy API. Call listen() to start it.
 *
 * @param {object} [options]
 * @param {number} [options.stageMs=150] - How long each state lasts. Screenshots
 *   and diffs advance with time, not with the number of polls.
 * @returns {object}
 */
function createMock(options = {}) {
  const stageMs = options.stageMs || parseInt(process.env.DIFFY_MOCK_STAGE_MS, 10) || 150;
  const projects = new Map();
  const snapshots = new Map();
  const diffs = new Map();
  const tokens = new Map();
  const requests = [];
  let injections = [];
  let nextSnapshotId = 7001;
  let nextDiffId = 9001;
  let nextDiffState = null;
  let host = '';
  let server = null;

  projects.set(1001, defaultProject());

  // ---------------------------------------------------------------- states

  const completeAt = (s) => s.createdAt + stageMs * (s.kind === 'remote' ? 3 : 1);

  function snapshotState(s) {
    if (s.forcedState !== undefined) return s.forcedState;
    const sequence = s.kind === 'remote'
      ? [SNAPSHOT_STATE.NOT_STARTED, SNAPSHOT_STATE.PROGRESS, SNAPSHOT_STATE.PROGRESS, SNAPSHOT_STATE.COMPLETED, SNAPSHOT_STATE.COMPLETED_HOOK_EXECUTED, SNAPSHOT_STATE.ZIPFILE]
      : [SNAPSHOT_STATE.PROGRESS, SNAPSHOT_STATE.COMPLETED, SNAPSHOT_STATE.COMPLETED_HOOK_EXECUTED, SNAPSHOT_STATE.ZIPFILE];
    const stage = Math.floor((Date.now() - s.createdAt) / stageMs);
    return sequence[Math.min(stage, sequence.length - 1)];
  }

  function diffState(d) {
    if (d.forcedState !== undefined) return d.forcedState;
    const s1 = snapshots.get(d.snapshot1);
    const s2 = snapshots.get(d.snapshot2);
    const ready = Math.max(completeAt(s1), completeAt(s2));
    const now = Date.now();
    if (now < ready) return DIFF_STATE.SNAPSHOT_IN_PROGRESS;
    const phases = [DIFF_STATE.PROGRESS, DIFF_STATE.COMPLETED, DIFF_STATE.COMPLETED_HOOK_EXECUTED, DIFF_STATE.ZIPFILE];
    return phases[Math.min(Math.floor((now - ready) / stageMs), phases.length - 1)];
  }

  /**
   * Compare two snapshots image by image. A page present on one side only
   * counts as changed.
   */
  function compare(s1, s2) {
    const key = (i) => `${i.url}\u0000${i.breakpoint}`;
    const a = new Map(s1.items.map((i) => [key(i), i]));
    const b = new Map(s2.items.map((i) => [key(i), i]));
    const result = {};
    const changedPages = new Set();
    const pages = new Set();
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const left = a.get(k);
      const right = b.get(k);
      const { url, breakpoint } = left || right;
      pages.add(url);
      let changes = 0;
      if (!left || !right) {
        changes = 100;
      } else if (left.hash !== right.hash) {
        changes = 1 + ((parseInt(left.hash.slice(0, 6), 16) ^ parseInt(right.hash.slice(0, 6), 16)) % 4000) / 100;
      }
      if (changes) changedPages.add(url);
      result[url] = result[url] || {};
      result[url][breakpoint] = {
        diff: { score: changes ? changes / 100 : 0, full: `${host}/mock/images/${sha1(k)}-diff.png`, thumbnail: `${host}/mock/images/${sha1(k)}-diff-thumbnail.png` },
        idiff: { score: 0, full: '', thumbnail: '' },
        percentageChanges: changes ? changes.toFixed(2) : '0',
      };
    }
    return { diffs: result, result: pages.size ? Math.round((100 * changedPages.size) / pages.size) : 0 };
  }

  // --------------------------------------------------------------- records

  function newSnapshot(project, attrs) {
    const id = nextSnapshotId++;
    const snapshot = Object.assign({
      id,
      projectId: project.id,
      createdAt: Date.now(),
      token: sha1(`snapshot${id}`).slice(0, 16),
      baseline: false,
      name: '',
      items: [],
    }, attrs);
    snapshots.set(id, snapshot);
    return snapshot;
  }

  /** A server-side capture: one image per project page and breakpoint. */
  function newRemoteSnapshot(project, environment, baseUrl) {
    const items = [];
    for (const url of project.urls) {
      for (const breakpoint of project.breakpoints) {
        items.push({ url, breakpoint, hash: sha1(`${environment}|${baseUrl}|${url}|${breakpoint}`) });
      }
    }
    return newSnapshot(project, { kind: 'remote', environment, baseUrl, items, name: `${environment} ${new Date().toISOString()}` });
  }

  function newDiff(project, s1, s2, name) {
    const id = nextDiffId++;
    const diff = { id, projectId: project.id, snapshot1: s1.id, snapshot2: s2.id, name: name || '', createdAt: Date.now(), token: sha1(`diff${id}`).slice(0, 16) };
    if (nextDiffState !== null) {
      diff.forcedState = nextDiffState;
      nextDiffState = null;
    }
    diffs.set(id, diff);
    return diff;
  }

  // ---------------------------------------------------------------- routes

  const json = (res, status, body, headers) => {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, headers || {}));
    res.end(JSON.stringify(body));
  };
  const invalid = (res, ...errors) => json(res, 400, { type: 'validation_error', errors });
  const notFound = (res, what) => json(res, 404, { code: 404, message: `${what} not found` });

  function authorized(req) {
    const header = req.headers.authorization || '';
    const token = /^Bearer (.+)$/.exec(header);
    if (!token) return 'JWT Token not found';
    const expires = tokens.get(token[1]);
    if (!expires) return 'Invalid JWT Token';
    if (expires < Date.now()) return 'Expired JWT Token';
    return null;
  }

  function login(req, res, body) {
    if (typeof body.key !== 'string' || !body.key) return invalid(res, 'The key is required');
    if (body.key === NO_API_ACCESS_KEY) {
      return json(res, 403, { type: 'api_access_disabled', errors: ['API access is not enabled for this account'] });
    }
    if (body.key !== (options.apiKey || API_KEY)) return json(res, 401, { code: 401, message: 'Unknown key' });
    const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS, n: tokens.size })).toString('base64url')}.${sha1(String(Math.random())).slice(0, 16)}`;
    tokens.set(token, Date.now() + TOKEN_TTL_MS);
    // Diffy's clients read the token from the "token" property.
    return json(res, 200, { token });
  }

  function projectOf(res, id) {
    const project = projects.get(parseInt(id, 10));
    if (!project) notFound(res, 'Project');
    return project;
  }

  function createScreenshot(res, project, body) {
    if (!SCREENSHOT_ENVIRONMENTS.includes(body.environment)) {
      return invalid(res, `"environment" must be one of: ${SCREENSHOT_ENVIRONMENTS.join(', ')}`);
    }
    let baseUrl = project[body.environment];
    if (body.environment === 'custom') {
      if (!isHttpUrl(body.baseUrl)) return invalid(res, '"baseUrl" is required for the custom environment and must be a URL');
      baseUrl = body.baseUrl;
    } else if (!baseUrl) {
      return invalid(res, `The project has no ${body.environment} URL`);
    }
    return json(res, 200, newRemoteSnapshot(project, body.environment, baseUrl).id);
  }

  /** Read the files, urls and breakpoints of an upload and check they line up. */
  function readUpload(res, parts) {
    const field = (name) => parts.filter((p) => p.filename === null && p.name === name);
    const indexed = (prefix) => parts
      .filter((p) => new RegExp(`^${prefix}\\[\\d+\\]$`).test(p.name))
      .sort((x, y) => parseInt(x.name.replace(/\D/g, ''), 10) - parseInt(y.name.replace(/\D/g, ''), 10));
    const files = indexed('files');
    const urls = indexed('urls').map((p) => p.data.toString('utf8'));
    const breakpoints = indexed('breakpoints').map((p) => p.data.toString('utf8'));
    if (!files.length) return invalid(res, 'At least one file is required');
    if (files.length !== urls.length || files.length !== breakpoints.length) {
      return invalid(res, 'The number of "files", "urls" and "breakpoints" must be the same');
    }
    const items = [];
    for (let i = 0; i < files.length; i++) {
      const data = files[i].data;
      const png = data.length > 8 && data[0] === 0x89 && data.slice(1, 4).toString() === 'PNG';
      const webp = data.length > 12 && data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP';
      if (!png && !webp) return invalid(res, `files[${i}] is not a PNG or WebP image`);
      if (!/^[1-9]\d*$/.test(breakpoints[i])) return invalid(res, `breakpoints[${i}] must be an integer`);
      if (!urls[i]) return invalid(res, `urls[${i}] is empty`);
      items.push({ url: urls[i], breakpoint: parseInt(breakpoints[i], 10), hash: sha1(data) });
    }
    const name = field('snapshotName')[0];
    const functional = field('functionalTest')[0];
    return { items, name: name ? name.data.toString('utf8') : '', functionalTest: Boolean(functional && /^(1|true)$/i.test(functional.data.toString('utf8'))) };
  }

  function createCustomSnapshot(res, project, parts) {
    const upload = readUpload(res, parts);
    if (res.writableEnded) return undefined;
    if (!upload.name) return invalid(res, '"snapshotName" is required');
    if (!upload.functionalTest) {
      const unknown = upload.items.find((i) => !project.urls.includes(i.url));
      if (unknown) {
        return invalid(res, `The URL "${unknown.url}" is not in the project settings. Add it, or upload the images as a functional test`);
      }
    }
    const snapshot = newSnapshot(project, { kind: 'upload', environment: 'upload', baseUrl: '', items: upload.items, name: upload.name, functionalTest: upload.functionalTest });
    return json(res, 200, snapshot.id);
  }

  function updateSnapshot(res, snapshot, body, parts) {
    if (parts) {
      const upload = readUpload(res, parts);
      if (res.writableEnded) return undefined;
      snapshot.items = snapshot.items.concat(upload.items);
      if (upload.name) snapshot.name = upload.name;
    } else if (typeof body.name === 'string' && body.name) {
      snapshot.name = body.name;
    } else {
      return invalid(res, '"name" is required');
    }
    return json(res, 200, { id: snapshot.id, name: snapshot.name });
  }

  function createDiff(res, project, body) {
    if (!isPositiveInteger(body.snapshot1) || !isPositiveInteger(body.snapshot2)) {
      return invalid(res, '"snapshot1" and "snapshot2" are required and must be screenshot ids');
    }
    const s1 = snapshots.get(parseInt(body.snapshot1, 10));
    const s2 = snapshots.get(parseInt(body.snapshot2, 10));
    if (!s1 || s1.projectId !== project.id) return invalid(res, `Screenshot ${body.snapshot1} was not found in this project`);
    if (!s2 || s2.projectId !== project.id) return invalid(res, `Screenshot ${body.snapshot2} was not found in this project`);
    if (body.name !== undefined && typeof body.name !== 'string') return invalid(res, '"name" must be a string');
    return json(res, 200, newDiff(project, s1, s2, body.name).id);
  }

  /** Resolve one side of a compare call to a snapshot. */
  function compareSide(res, project, body, n) {
    const env = body[`env${n}`];
    if (!COMPARE_ENVIRONMENTS.includes(env)) {
      invalid(res, `"env${n}" must be one of: ${COMPARE_ENVIRONMENTS.join(', ')}`);
      return null;
    }
    if (env === 'baseline') {
      const baseline = snapshots.get(project.baselineSnapshotId);
      if (!baseline) invalid(res, 'The project has no baseline set');
      return baseline || null;
    }
    if (env === 'custom') {
      const url = body[`env${n}Url`];
      if (!isHttpUrl(url)) {
        invalid(res, `"env${n}Url" is required for the custom environment and must be a URL`);
        return null;
      }
      if (body[`env${n}CredsMode`] && !(body[`env${n}CredsUser`] && body[`env${n}CredsPass`])) {
        invalid(res, `"env${n}CredsUser" and "env${n}CredsPass" are required when "env${n}CredsMode" is on`);
        return null;
      }
      return newRemoteSnapshot(project, 'custom', url);
    }
    const field = ENV_TO_FIELD[env];
    if (!project[field]) {
      invalid(res, `The project has no ${field} URL`);
      return null;
    }
    return newRemoteSnapshot(project, field, project[field]);
  }

  function compareEnvironments(res, project, body) {
    const s1 = compareSide(res, project, body, 1);
    if (!s1) return undefined;
    const s2 = compareSide(res, project, body, 2);
    if (!s2) return undefined;
    // Diffy documents the response of compare as a string.
    return json(res, 200, String(newDiff(project, s1, s2, body.name).id));
  }

  function setBaseline(res, project, snapshotId) {
    const snapshot = snapshots.get(parseInt(snapshotId, 10));
    if (!snapshot || snapshot.projectId !== project.id) return notFound(res, 'Screenshot');
    const previous = snapshots.get(project.baselineSnapshotId);
    if (previous) previous.baseline = false;
    snapshot.baseline = true;
    project.baselineSnapshotId = snapshot.id;
    return json(res, 200, 'Baseline set');
  }

  function showSnapshot(res, snapshot) {
    const project = projects.get(snapshot.projectId);
    return json(res, 200, fullScreenshot(snapshot, snapshotState(snapshot), project, host));
  }

  function showDiff(res, diff) {
    const project = projects.get(diff.projectId);
    const s1 = snapshots.get(diff.snapshot1);
    const s2 = snapshots.get(diff.snapshot2);
    const { diffs: pages, result } = compare(s1, s2);
    return json(res, 200, fullDiff(diff, { state: diffState(diff), result, diffs: pages, s1, s2, project, host }));
  }

  function route(req, res, url, raw) {
    const contentType = req.headers['content-type'] || '';
    const multipart = /^multipart\/form-data/i.test(contentType) ? parseMultipart(raw, contentType) : null;
    let body = {};
    if (!multipart && raw.length) {
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch (e) {
        return invalid(res, 'The request body is not valid JSON');
      }
    }
    const path = url.pathname.replace(/^\/api\//, '');
    const m = (pattern) => pattern.exec(path);
    let match;

    if (req.method === 'POST' && path === 'auth/key') return login(req, res, body);

    const problem = authorized(req);
    if (problem) return json(res, 401, { code: 401, message: problem });

    if ((match = m(/^projects\/(\d+)$/)) && req.method === 'GET') {
      const project = projectOf(res, match[1]);
      return project ? json(res, 200, fullProject(project)) : undefined;
    }
    if ((match = m(/^projects\/(\d+)\/screenshots$/)) && req.method === 'POST') {
      const project = projectOf(res, match[1]);
      return project ? createScreenshot(res, project, body) : undefined;
    }
    if ((match = m(/^projects\/(\d+)\/create-custom-snapshot$/)) && req.method === 'POST') {
      const project = projectOf(res, match[1]);
      if (!project) return undefined;
      if (!multipart) return invalid(res, 'The request must be multipart/form-data');
      return createCustomSnapshot(res, project, multipart);
    }
    if ((match = m(/^projects\/(\d+)\/diffs$/)) && req.method === 'POST') {
      const project = projectOf(res, match[1]);
      return project ? createDiff(res, project, body) : undefined;
    }
    if ((match = m(/^projects\/(\d+)\/compare$/)) && req.method === 'POST') {
      const project = projectOf(res, match[1]);
      return project ? compareEnvironments(res, project, body) : undefined;
    }
    if ((match = m(/^projects\/(\d+)\/set-base-line-set\/(\d+)$/)) && req.method === 'PUT') {
      const project = projectOf(res, match[1]);
      return project ? setBaseline(res, project, match[2]) : undefined;
    }
    if ((match = m(/^snapshots\/(\d+)$/))) {
      const snapshot = snapshots.get(parseInt(match[1], 10));
      if (!snapshot) return notFound(res, 'Screenshot');
      if (req.method === 'GET') return showSnapshot(res, snapshot);
      // Diffy documents PUT for renaming and appending; its CLI appends with POST.
      if (req.method === 'PUT' || req.method === 'POST') return updateSnapshot(res, snapshot, body, multipart);
    }
    if ((match = m(/^diffs\/(\d+)$/)) && req.method === 'GET') {
      const diff = diffs.get(parseInt(match[1], 10));
      return diff ? showDiff(res, diff) : notFound(res, 'Diff');
    }
    return notFound(res, 'Route');
  }

  function handle(req, res) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url, host || 'http://127.0.0.1');
      requests.push({ method: req.method, path: url.pathname.replace(/^\/api\//, ''), query: url.search, contentType: req.headers['content-type'] || '', authorization: req.headers.authorization || '', raw });
      const injected = injections.find((i) => i.times > 0 && i.method === req.method && i.pattern.test(url.pathname));
      if (injected) {
        injected.times -= 1;
        return json(res, injected.status, injected.body || { code: injected.status, message: 'Injected failure' }, injected.headers);
      }
      if (!url.pathname.startsWith('/api/')) return json(res, 404, { code: 404, message: 'Route not found' });
      return route(req, res, url, raw);
    });
  }

  // ------------------------------------------------------------ public API

  return {
    /** Start listening on an ephemeral local port. Resolves with the API base URL. */
    listen() {
      server = http.createServer(handle);
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          host = `http://127.0.0.1:${server.address().port}`;
          resolve(`${host}/api/`);
        });
      });
    },
    close() {
      return new Promise((resolve) => (server ? server.close(() => { server = null; resolve(); }) : resolve()));
    },
    apiKey: options.apiKey || API_KEY,
    noApiAccessKey: NO_API_ACCESS_KEY,
    project: () => projects.get(1001),
    /** Every request received so far, oldest first. */
    requests,
    /** Make the next `times` requests matching method and path answer with a status. */
    inject({ method, pattern, status, times = 1, headers, body }) {
      injections.push({ method, pattern, status, times, headers, body });
    },
    /** Make every issued token expire, as Diffy's do. */
    expireTokens() {
      for (const token of tokens.keys()) tokens.set(token, Date.now() - 1000);
    },
    /** The next diff created is held in this state (for example -1 for a stopped diff). */
    forceNextDiffState(state) {
      nextDiffState = state;
    },
    forceSnapshotState(id, state) {
      snapshots.get(id).forcedState = state;
    },
    reset() {
      requests.length = 0;
      injections = [];
      nextDiffState = null;
      projects.set(1001, defaultProject());
    },
  };
}

let shared = null;

/**
 * Start the shared mock used by the suite.
 *
 * @returns {Promise<string>} The API base URL.
 */
async function createMockServer() {
  shared = createMock();
  const baseUrl = await shared.listen();
  module.exports.mock = shared;
  return baseUrl;
}

async function stopMockServer() {
  if (shared) await shared.close();
  shared = null;
}

module.exports = { createMock, createMockServer, stopMockServer, mock: null };
