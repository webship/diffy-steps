'use strict';

// Client for the Diffy REST API, used by diffy.steps.js. No step is defined
// here, and nothing from webship-js is loaded, so it can be tested on its own.
//
// The contract it follows:
//   - the Swagger: https://app.diffy.website/rest/swagger.json
//   - the state values and the `result` field of a diff: the official clients,
//     https://github.com/DiffyWebsite/diffy-php and /diffy-cli
//
// Behaviour worth knowing:
//   - POST auth/key exchanges the API key for a bearer token. The token is kept
//     for the run and renewed once when Diffy answers 401 (it expires).
//   - 429 is retried after the Retry-After wait (at most MAX_RATE_RETRIES
//     times). A GET is retried on 502, 503 and 504. Nothing else is repeated,
//     so a request that changes something is never sent twice by accident.
//   - Every failure becomes an Error whose message says what Diffy answered and
//     what to change, in the layout of webship-js `friendly()`.

const DEFAULT_BASE_URL = 'https://app.diffy.website/api/';
const KEYS_URL = 'https://app.diffy.website/#/keys';

/** A screenshot set is complete in these states (diffy-php Screenshot.php). */
const SNAPSHOT_COMPLETED = [2, 3, 4];
/** A diff is complete in these states (diffy-php Diff.php). */
const DIFF_COMPLETED = [2, 3, 4, 7];
/** The states a diff passes through on its way to completion. Any other state, such as -1 (stopped), is a failure. */
const DIFF_RUNNING = [0, 1, 5, 8];
/** Images sent per request. Diffy's CLI sends 10 and appends the rest to the first set. */
const UPLOAD_BATCH_SIZE = 10;
const MAX_RATE_RETRIES = 3;
const MAX_SERVER_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 60 * 1000;

const SHORT_ENVIRONMENT = { prod: 'production', stage: 'staging', dev: 'development' };
const LONG_ENVIRONMENT = { production: 'prod', staging: 'stage', development: 'dev' };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function pick(envVal, paramVal, fallback) {
  if (envVal !== undefined && envVal !== '') return envVal;
  if (paramVal !== undefined && paramVal !== '' && paramVal !== null) return paramVal;
  return fallback;
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (/^(1|true|yes|on)$/i.test(String(value))) return true;
  if (/^(0|false|no|off)$/i.test(String(value))) return false;
  return fallback;
}

/**
 * Resolve the Diffy settings: DIFFY_* environment variables first, then the
 * `diffy` block of the cucumber.js worldParameters, then the defaults.
 *
 * @param {object} [parameters] - The cucumber.js worldParameters.
 * @returns {object}
 */
function resolveConfig(parameters) {
  const p = (parameters && parameters.diffy) || {};
  const env = process.env;
  const breakpointsRaw = pick(env.DIFFY_BREAKPOINTS, p.breakpoints, '1200');
  return {
    apiKey: pick(env.DIFFY_API_KEY, p.apiKey, ''),
    projectId: parseInt(pick(env.DIFFY_PROJECT_ID, p.projectId, '0'), 10) || 0,
    breakpoints: String(breakpointsRaw).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0),
    windowHeight: toNumber(pick(env.DIFFY_WINDOW_HEIGHT, p.windowHeight, 2000), 2000),
    screenshotsDir: pick(env.DIFFY_SCREENSHOTS_DIR, p.screenshotsDir, ''),
    baseUrl: String(pick(env.DIFFY_API_BASE_URL, p.baseUrl, DEFAULT_BASE_URL)).replace(/\/*$/, '/'),
    maxWait: toNumber(pick(env.DIFFY_MAX_WAIT, p.maxWait, 1200), 1200),
    pollInterval: toNumber(pick(env.DIFFY_POLL_INTERVAL, p.pollInterval, 10), 10),
    requestTimeout: toNumber(pick(env.DIFFY_REQUEST_TIMEOUT, p.requestTimeout, 120), 120),
    functionalTest: toBoolean(pick(env.DIFFY_FUNCTIONAL_TEST, p.functionalTest, true), true),
    commitSha: pick(env.DIFFY_COMMIT_SHA, p.commitSha, ''),
    env1Url: pick(env.DIFFY_ENV1_URL, p.env1Url, ''),
    env2Url: pick(env.DIFFY_ENV2_URL, p.env2Url, ''),
    env1User: pick(env.DIFFY_ENV1_USER, p.env1User, ''),
    env1Pass: pick(env.DIFFY_ENV1_PASS, p.env1Pass, ''),
    env2User: pick(env.DIFFY_ENV2_USER, p.env2User, ''),
    env2Pass: pick(env.DIFFY_ENV2_PASS, p.env2Pass, ''),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * An Error in the layout of webship-js `friendly()`: what failed, why, and
 * what to do about it. The stack is the message, so the output stays short.
 *
 * @param {{message: string, cause?: string, hint?: string, status?: number}} input
 * @returns {Error}
 */
function explain({ message, cause, hint, status }) {
  const lines = [message];
  if (cause) lines.push(`  Why: ${cause}`);
  if (hint) lines.push(`  Hint: ${hint}`);
  const error = new Error(lines.join('\n'));
  error.stack = error.message;
  if (status !== undefined) error.status = status;
  return error;
}

/** The part of an error body worth showing: its messages, or the start of the text. */
function describeBody(body) {
  if (body === undefined || body === null || body === '') return '';
  if (typeof body === 'string') return body.length > 300 ? `${body.slice(0, 300)}...` : body;
  const parts = [];
  if (Array.isArray(body.errors)) parts.push(body.errors.join('. '));
  if (body.message) parts.push(body.message);
  if (body.fields) parts.push(typeof body.fields === 'string' ? body.fields : JSON.stringify(body.fields));
  return parts.length ? parts.join(' ') : JSON.stringify(body).slice(0, 300);
}

function notFoundHint(uri, cfg) {
  if (/^projects\//.test(uri)) {
    return `Check DIFFY_PROJECT_ID (now ${cfg.projectId || 'not set'}): it is the number in the project's URL in Diffy, and the API key must belong to an account that can open that project.`;
  }
  if (/^snapshots\//.test(uri)) return 'The screenshot set id comes from an earlier step; it may belong to another project or have been deleted.';
  if (/^diffs\//.test(uri)) return 'The comparison id comes from an earlier step; it may belong to another project or have been deleted.';
  return `Check DIFFY_API_BASE_URL (now ${cfg.baseUrl}).`;
}

/**
 * Turn a failed response into an error with a hint.
 *
 * @param {object} cfg
 * @param {string} method
 * @param {string} uri
 * @param {number} status
 * @param {*} body
 * @returns {Error}
 */
function failure(cfg, method, uri, status, body) {
  const what = `${method} ${uri}`;
  const detail = describeBody(body);
  const type = body && typeof body === 'object' ? body.type : undefined;
  if (status === 401 && uri === 'auth/key') {
    return explain({
      message: 'Diffy did not accept the API key.',
      cause: detail || 'POST auth/key answered 401',
      hint: `Create a key at ${KEYS_URL} and export it as DIFFY_API_KEY. A key only works against the Diffy address it was made for (DIFFY_API_BASE_URL, now ${cfg.baseUrl}).`,
      status,
    });
  }
  if (status === 403 && type === 'api_access_disabled') {
    return explain({
      message: 'The Diffy account of this API key has no API access.',
      cause: detail,
      hint: 'API access needs a paid plan or a coupon. Use a key of an account that has it.',
      status,
    });
  }
  if (status === 401) {
    return explain({
      message: `Diffy refused the bearer token for ${what}, also after logging in again.`,
      cause: detail,
      hint: `Check that DIFFY_API_KEY is still valid at ${KEYS_URL}.`,
      status,
    });
  }
  if (status === 403) {
    return explain({
      message: `Diffy refused ${what}.`,
      cause: detail || 'answered 403',
      hint: `The API key's account may not be allowed to use project ${cfg.projectId || '(DIFFY_PROJECT_ID not set)'}.`,
      status,
    });
  }
  if (status === 404) {
    return explain({ message: `Diffy has nothing at ${what}.`, cause: detail || 'answered 404', hint: notFoundHint(uri, cfg), status });
  }
  if (status === 400 || status === 422) {
    return explain({
      message: `Diffy rejected ${what}.`,
      cause: detail || `answered ${status}`,
      hint: 'The request does not match what the project allows. Compare it with the Diffy API documentation at https://app.diffy.website/rest.',
      status,
    });
  }
  if (status === 429) {
    return explain({
      message: `Diffy is limiting the number of requests (${what}).`,
      cause: detail || 'answered 429 after the retries',
      hint: 'Wait a little and run again, or send fewer requests (fewer screenshots per run, a longer DIFFY_POLL_INTERVAL).',
      status,
    });
  }
  return explain({
    message: `Diffy answered ${status} for ${what}.`,
    cause: detail,
    hint: status >= 500 ? 'Diffy had a problem on its side. Run again in a few minutes.' : undefined,
    status,
  });
}

/**
 * Read a Retry-After header (seconds or an HTTP date) as milliseconds.
 *
 * @param {string|null} header
 * @param {number} attempt - Zero-based retry number, for the fallback backoff.
 * @returns {number}
 */
function retryDelay(header, attempt) {
  let ms = 1000 * 2 ** attempt;
  if (header) {
    if (/^\d+$/.test(header.trim())) ms = parseInt(header, 10) * 1000;
    else if (!Number.isNaN(Date.parse(header))) ms = Math.max(0, Date.parse(header) - Date.now());
  }
  return Math.min(ms, MAX_RETRY_WAIT_MS);
}

/**
 * Read an id from a response. Diffy answers a bare number, and a string for
 * compare; both are accepted, and an object with an `id` too.
 *
 * @param {*} data
 * @param {string} what - For the error message.
 * @returns {number}
 */
function toId(data, what) {
  const value = data !== null && typeof data === 'object' ? data.id : data;
  const id = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isInteger(id) || id <= 0) {
    throw explain({
      message: `Diffy did not answer a ${what} id.`,
      cause: `got ${JSON.stringify(data)}`,
      hint: 'Check DIFFY_API_BASE_URL and run the step again.',
    });
  }
  return id;
}

/**
 * Normalise the environment of a screenshot request to Diffy's long names.
 *
 * @param {string} environment - production, staging, development, custom, or prod, stage, dev.
 * @returns {string}
 */
function screenshotEnvironment(environment) {
  const env = SHORT_ENVIRONMENT[environment] || environment;
  const allowed = ['production', 'staging', 'development', 'custom'];
  if (!allowed.includes(env)) {
    throw explain({
      message: `"${environment}" is not an environment Diffy can take screenshots from.`,
      hint: `Use one of: production (prod), staging (stage), development (dev), custom.`,
    });
  }
  return env;
}

/**
 * Normalise an environment of a compare request to Diffy's short names.
 *
 * @param {string} environment - prod, stage, dev, baseline, custom, or production, staging, development.
 * @returns {string}
 */
function compareEnvironment(environment) {
  const env = LONG_ENVIRONMENT[environment] || environment;
  const allowed = ['prod', 'stage', 'dev', 'baseline', 'custom'];
  if (!allowed.includes(env)) {
    throw explain({
      message: `"${environment}" is not an environment Diffy can compare.`,
      hint: 'Use one of: prod (production), stage (staging), dev (development), baseline, custom.',
    });
  }
  return env;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Bearer tokens, by address and key, kept for the whole run. */
const tokens = new Map();

class DiffyClient {
  /**
   * @param {object} cfg - See resolveConfig().
   * @param {object} [deps]
   * @param {function(number): Promise<void>} [deps.sleep] - For tests.
   * @param {function(): number} [deps.now] - For tests.
   */
  constructor(cfg, deps = {}) {
    this.cfg = cfg;
    this.sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = deps.now || Date.now;
  }

  get tokenKey() {
    return `${this.cfg.baseUrl}\u0000${this.cfg.apiKey}`;
  }

  ensureProject() {
    if (!this.cfg.projectId) {
      throw explain({
        message: 'The Diffy project id is not set.',
        hint: 'Export DIFFY_PROJECT_ID (the number in the project URL in Diffy) or set diffy.projectId in the worldParameters of cucumber.js.',
      });
    }
    return this.cfg.projectId;
  }

  async fetchOnce(method, uri, { token, json, form }) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (form !== undefined) {
      body = form;
    } else if (json !== undefined) {
      body = JSON.stringify(json);
      headers['Content-Type'] = 'application/json';
    }
    try {
      return await fetch(this.cfg.baseUrl + uri, { method, headers, body, signal: AbortSignal.timeout(this.cfg.requestTimeout * 1000) });
    } catch (e) {
      const reason = e.name === 'TimeoutError' ? `no answer within ${this.cfg.requestTimeout} s` : (e.cause && e.cause.message) || e.message;
      throw explain({
        message: `Could not reach Diffy (${method} ${uri}).`,
        cause: reason,
        hint: `Check the network and DIFFY_API_BASE_URL (now ${this.cfg.baseUrl}). Behind a proxy, Node needs it configured as well.`,
      });
    }
  }

  async parse(res) {
    const text = await res.text();
    if (!text) return '';
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  /** Log in with the API key and keep the bearer token. */
  async login() {
    if (!this.cfg.apiKey) {
      throw explain({
        message: 'The Diffy API key is not set.',
        hint: `Export DIFFY_API_KEY (create one at ${KEYS_URL}) or set diffy.apiKey in cucumber.js. Do not commit the key.`,
      });
    }
    const res = await this.fetchOnce('POST', 'auth/key', { json: { key: this.cfg.apiKey } });
    const data = await this.parse(res);
    if (!res.ok) throw failure(this.cfg, 'POST', 'auth/key', res.status, data);
    // Diffy's clients read data.token; the Swagger describes a plain string.
    const token = typeof data === 'string' ? data : data && data.token;
    if (!token) {
      throw explain({ message: 'Diffy did not answer a token for the API key.', cause: `got ${JSON.stringify(data)}`, hint: `Check DIFFY_API_BASE_URL (now ${this.cfg.baseUrl}).` });
    }
    tokens.set(this.tokenKey, token);
    return token;
  }

  async token() {
    return tokens.get(this.tokenKey) || this.login();
  }

  /**
   * One authenticated call. Renews the token once on 401, honours Retry-After
   * on 429 and retries a GET on 502, 503 and 504.
   *
   * @param {string} method
   * @param {string} uri - Relative to the API base URL.
   * @param {{json?: *, form?: FormData}} [options]
   * @returns {Promise<*>} The parsed response.
   */
  async request(method, uri, options = {}) {
    let renewed = false;
    let rateRetries = 0;
    let serverRetries = 0;
    for (;;) {
      const token = await this.token();
      const res = await this.fetchOnce(method, uri, Object.assign({ token }, options));
      if (res.ok) return this.parse(res);
      if (res.status === 401 && !renewed) {
        renewed = true;
        tokens.delete(this.tokenKey);
        continue;
      }
      if (res.status === 429 && rateRetries < MAX_RATE_RETRIES) {
        await this.sleep(retryDelay(res.headers.get('retry-after'), rateRetries++));
        continue;
      }
      if (method === 'GET' && [502, 503, 504].includes(res.status) && serverRetries < MAX_SERVER_RETRIES) {
        await this.sleep(retryDelay(null, serverRetries++));
        continue;
      }
      throw failure(this.cfg, method, uri, res.status, await this.parse(res));
    }
  }

  /**
   * Read the project: proves the key, the API access and the project id at once.
   * GET projects/{id}
   *
   * @returns {Promise<object>} The project settings (name, URLs, breakpoints, ...).
   */
  async getProject() {
    return this.request('GET', `projects/${this.ensureProject()}`);
  }

  // ------------------------------------------------------------ screenshots

  /**
   * Ask Diffy to capture the project's pages from an environment.
   * POST projects/{id}/screenshots
   *
   * @param {string} environment - See screenshotEnvironment().
   * @param {string} [baseUrl] - Required for custom: the site Diffy captures.
   * @returns {Promise<number>} The screenshot set id.
   */
  async createScreenshot(environment, baseUrl) {
    const id = this.ensureProject();
    const env = screenshotEnvironment(environment);
    const body = { environment: env };
    if (env === 'custom') {
      if (!baseUrl) {
        throw explain({
          message: 'The custom environment needs a URL.',
          hint: 'Export DIFFY_ENV1_URL, or use: create diffy screenshot from the custom environment "https://...".',
        });
      }
      body.baseUrl = baseUrl;
    }
    return toId(await this.request('POST', `projects/${id}/screenshots`, { json: body }), 'screenshot set');
  }

  /**
   * Upload images as one screenshot set.
   * POST projects/{id}/create-custom-snapshot (multipart), and for more than
   * UPLOAD_BATCH_SIZE images the rest appended to the set, ten at a time.
   *
   * @param {string} name
   * @param {{buffer: Buffer, url: string, breakpoint: number, filename: string, contentType: string}[]} images
   * @param {{functionalTest?: boolean}} [options]
   * @returns {Promise<number>} The screenshot set id.
   */
  async uploadSnapshot(name, images, options = {}) {
    const projectId = this.ensureProject();
    if (!images.length) throw explain({ message: 'There are no images to upload.' });
    const form = (batch, first) => {
      const data = new FormData();
      if (first) {
        data.append('snapshotName', name);
        if (options.functionalTest) data.append('functionalTest', '1');
      }
      batch.forEach((image, i) => {
        data.append(`files[${i}]`, new Blob([image.buffer], { type: image.contentType || 'image/png' }), image.filename || `screenshot-${i}.png`);
        data.append(`urls[${i}]`, image.url);
        data.append(`breakpoints[${i}]`, String(image.breakpoint));
      });
      return data;
    };
    const batches = [];
    for (let i = 0; i < images.length; i += UPLOAD_BATCH_SIZE) batches.push(images.slice(i, i + UPLOAD_BATCH_SIZE));
    const id = toId(await this.request('POST', `projects/${projectId}/create-custom-snapshot`, { form: form(batches[0], true) }), 'screenshot set');
    for (const batch of batches.slice(1)) {
      await this.appendImages(id, form(batch, false));
    }
    return id;
  }

  /**
   * Append images to a screenshot set. The Swagger documents PUT
   * snapshots/{id}; Diffy's CLI sends POST. PUT first, POST when the route is
   * not there.
   */
  async appendImages(id, form) {
    try {
      await this.request('PUT', `snapshots/${id}`, { form });
    } catch (e) {
      if (e.status !== 404 && e.status !== 405) throw e;
      await this.request('POST', `snapshots/${id}`, { form });
    }
  }

  /**
   * Make a screenshot set the project's baseline.
   * PUT projects/{id}/set-base-line-set/{screenshotId}
   *
   * @param {number} screenshotId
   */
  async setBaseline(screenshotId) {
    const projectId = this.ensureProject();
    await this.request('PUT', `projects/${projectId}/set-base-line-set/${screenshotId}`);
  }

  /** GET snapshots/{id} */
  getScreenshot(id) {
    return this.request('GET', `snapshots/${id}`);
  }

  /**
   * Wait until a screenshot set is complete (state 2, 3 or 4).
   *
   * @param {number} id
   * @returns {Promise<object>} The final screenshot data.
   */
  waitForScreenshot(id) {
    return this.poll({
      label: `Screenshot set ${id}`,
      uri: `snapshots/${id}`,
      isDone: (state) => SNAPSHOT_COMPLETED.includes(state),
      isFailed: (state) => state < 0,
      describeFailure: (state) => (state === -1 ? 'stopped' : `state ${state}`),
    });
  }

  // ------------------------------------------------------------------ diffs

  /**
   * Compare two screenshot sets.
   * POST projects/{id}/diffs
   *
   * @param {number} snapshot1
   * @param {number} snapshot2
   * @param {string} [name]
   * @returns {Promise<number>} The diff id.
   */
  async createDiff(snapshot1, snapshot2, name = '') {
    const projectId = this.ensureProject();
    return toId(await this.request('POST', `projects/${projectId}/diffs`, { json: { snapshot1, snapshot2, name } }), 'comparison');
  }

  /**
   * Let Diffy capture two environments and compare them.
   * POST projects/{id}/compare
   *
   * @param {string} env1
   * @param {string} env2
   * @param {object} [options] - name, env1Url, env2Url, env1User, env1Pass, env2User, env2Pass, commitSha.
   * @returns {Promise<number>} The diff id.
   */
  async compare(env1, env2, options = {}) {
    const projectId = this.ensureProject();
    const body = { env1: compareEnvironment(env1), env2: compareEnvironment(env2) };
    for (const n of [1, 2]) {
      if (body[`env${n}`] !== 'custom') continue;
      const url = options[`env${n}Url`];
      if (!url) {
        throw explain({
          message: `Environment ${n} is "custom" and needs a URL.`,
          hint: `Export DIFFY_ENV${n}_URL with the address Diffy should capture.`,
        });
      }
      body[`env${n}Url`] = url;
      if (options[`env${n}User`] && options[`env${n}Pass`]) {
        body[`env${n}CredsMode`] = true;
        body[`env${n}CredsUser`] = options[`env${n}User`];
        body[`env${n}CredsPass`] = options[`env${n}Pass`];
      }
    }
    if (options.name) body.name = options.name;
    if (options.commitSha) body.commitSha = options.commitSha;
    return toId(await this.request('POST', `projects/${projectId}/compare`, { json: body }), 'comparison');
  }

  /** GET diffs/{id} */
  getDiff(id) {
    return this.request('GET', `diffs/${id}`);
  }

  /**
   * Wait until a diff is complete (state 2, 3, 4 or 7). Fails at once when the
   * diff is in a state outside the documented ones (for example -1, stopped).
   *
   * @param {number} id
   * @returns {Promise<object>} The final diff data.
   */
  waitForDiff(id) {
    return this.poll({
      label: `Comparison ${id}`,
      uri: `diffs/${id}`,
      isDone: (state) => DIFF_COMPLETED.includes(state),
      isFailed: (state) => !DIFF_COMPLETED.includes(state) && !DIFF_RUNNING.includes(state),
      describeFailure: (state) => (state === -1 ? 'stopped' : `state ${state}`),
    });
  }

  /**
   * Poll a resource until it is done, has failed, or DIFFY_MAX_WAIT passes.
   * The first poll is immediate; then one every DIFFY_POLL_INTERVAL seconds.
   */
  async poll({ label, uri, isDone, isFailed, describeFailure }) {
    const deadline = this.now() + this.cfg.maxWait * 1000;
    const interval = Math.max(this.cfg.pollInterval, 0.01) * 1000;
    let data;
    for (;;) {
      data = await this.request('GET', uri);
      const state = Number(data && data.state);
      if (!data || Number.isNaN(state)) {
        throw explain({ message: `${label}: Diffy answered no state.`, cause: `got ${JSON.stringify(data).slice(0, 200)}`, hint: 'Check DIFFY_API_BASE_URL.' });
      }
      if (isDone(state)) return data;
      if (isFailed(state)) {
        throw explain({
          message: `${label} did not finish: it is ${describeFailure(state)}.`,
          cause: data.status && data.status.status ? `Diffy reports "${data.status.status}"` : undefined,
          hint: 'Open it in Diffy to see why, or start it again.',
        });
      }
      const left = deadline - this.now();
      if (left <= 0) {
        throw explain({
          message: `${label} did not finish within ${this.cfg.maxWait} s.`,
          cause: `last state ${state}${data.status && data.status.estimate ? `, Diffy estimates ${data.status.estimate}` : ''}`,
          hint: 'It keeps running on Diffy. Raise DIFFY_MAX_WAIT if the project is large.',
        });
      }
      await this.sleep(Math.min(interval, left));
    }
  }
}

/**
 * The pages and breakpoints of a finished diff that changed.
 *
 * @param {object} diff - The data of GET diffs/{id}.
 * @returns {{url: string, breakpoint: string, percentage: number}[]}
 */
function changedPages(diff) {
  const found = [];
  for (const [url, breakpoints] of Object.entries((diff && diff.diffs) || {})) {
    for (const [breakpoint, item] of Object.entries(breakpoints || {})) {
      const percentage = Number(item && item.percentageChanges) || 0;
      if (percentage > 0) found.push({ url, breakpoint, percentage });
    }
  }
  return found;
}

/**
 * A one-line account of a finished diff, for the report.
 *
 * @param {number} id
 * @param {object} diff
 * @returns {string}
 */
function summarize(id, diff) {
  const result = Number(diff.result) || 0;
  const where = diff.diffSharedUrl ? ` Report: ${diff.diffSharedUrl}` : '';
  return result === 0
    ? `Diffy comparison ${id}: no changes found.${where}`
    : `Diffy comparison ${id}: ${result}% of the pages changed (${changedPages(diff).length} page and breakpoint pairs).${where}`;
}

module.exports = {
  DEFAULT_BASE_URL,
  UPLOAD_BATCH_SIZE,
  DiffyClient,
  resolveConfig,
  explain,
  failure,
  toId,
  retryDelay,
  screenshotEnvironment,
  compareEnvironment,
  changedPages,
  summarize,
  clearTokens: () => tokens.clear(),
};
