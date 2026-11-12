'use strict';

// Response shapes of the Diffy REST API, built from the published contract:
//   - Swagger: https://app.diffy.website/rest/swagger.json
//     (FullProject, FullScreenshot, FullDiff, KeyLogin, Error)
//   - the state values and the `result` field: the official Diffy clients,
//     https://github.com/DiffyWebsite/diffy-php (Screenshot.php, Diff.php)
//
// Everything the mock invents (ids, hosts, hashes) is marked as such: it is
// fixture data, not something Diffy documents.

/** Screenshot (snapshot) states, as in diffy-php Screenshot.php. */
const SNAPSHOT_STATE = {
  NOT_STARTED: 0,
  PROGRESS: 1,
  COMPLETED: 2,
  COMPLETED_HOOK_EXECUTED: 3,
  ZIPFILE: 4,
};

/** Diff states, as in diffy-php Diff.php. -1 is a stopped diff. */
const DIFF_STATE = {
  STOPPED: -1,
  NOT_STARTED: 0,
  PROGRESS: 1,
  COMPLETED: 2,
  COMPLETED_HOOK_EXECUTED: 3,
  ZIPFILE: 4,
  SNAPSHOT_IN_PROGRESS: 5,
  WITHOUT_ZIP: 7,
  SNAPSHOT_IN_PROGRESS_DIFF_IN_PROGRESS: 8,
};

const ENV_LABEL = { production: 'Prod', staging: 'Stage', development: 'Dev', custom: 'Custom', upload: 'Upload' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a time as Diffy shows it in the diff list ("j M - h:i").
 *
 * @param {number} ms
 * @returns {string}
 */
function diffyDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} - ${pad(d.getUTCHours() % 12 || 12)}:${pad(d.getUTCMinutes())}`;
}

/**
 * The url -> breakpoint -> { full, thumbnail } map of a snapshot's images.
 *
 * @param {object} snapshot
 * @param {string} host
 * @returns {object}
 */
function imageMap(snapshot, host) {
  const map = {};
  for (const item of snapshot.items) {
    map[item.url] = map[item.url] || {};
    map[item.url][item.breakpoint] = {
      full: `${host}/mock/images/${item.hash}.png`,
      thumbnail: `${host}/mock/images/${item.hash}-thumbnail.png`,
    };
  }
  return map;
}

/**
 * The project the mock serves (FullProject).
 *
 * @param {object} project
 * @returns {object}
 */
function fullProject(project) {
  return {
    name: project.name,
    urls: project.urls,
    production: project.production,
    staging: project.staging,
    development: project.development,
    breakpoints: project.breakpoints,
    schedule: [],
    notify: {
      psNotifyScreenshot: false,
      psNotifyDiff: false,
      psNotifyDiffPercent: 0,
      psNotifyEmails: '',
      psNotifySlackChannel: '',
      psNotifySlackWebhookUrl: '',
    },
  };
}

/**
 * FullScreenshot, for GET snapshots/{id}.
 *
 * @param {object} snapshot - Mock store record.
 * @param {number} state - Current state.
 * @param {object} project
 * @param {string} host - Mock host, used for the fixture image links.
 * @returns {object}
 */
function fullScreenshot(snapshot, state, project, host) {
  const done = state >= SNAPSHOT_STATE.COMPLETED;
  const screenshots = {};
  if (done) {
    for (const item of snapshot.items) {
      screenshots[item.url] = screenshots[item.url] || {};
      screenshots[item.url][item.breakpoint] = {
        full: `${host}/mock/images/${item.hash}.png`,
        thumbnail: `${host}/mock/images/${item.hash}-thumbnail.png`,
        jsConsole: '',
        html: '',
        data: { pageArea: 1200 * 2000 },
      };
    }
  }
  const pending = done ? 0 : snapshot.items.length;
  return {
    date: Math.floor(snapshot.createdAt / 1000),
    environment: snapshot.environment,
    baseUrl: snapshot.baseUrl,
    baseline: Boolean(snapshot.baseline),
    breakpoints: [...new Set(snapshot.items.map((i) => String(i.breakpoint)))],
    browserstack: false,
    name: snapshot.name,
    snapshotSharedToken: snapshot.token,
    snapshotSharedUrl: `${host}/mock/share/snapshots/${snapshot.token}`,
    state,
    status: {
      results: snapshot.items.length - pending,
      items: snapshot.items.length,
      queue: pending,
      estimate: done ? '' : 'under 1 minute',
      jobs: pending,
      status: done ? 'completed' : 'in progress',
    },
    project: { id: project.id, name: project.name },
    screenshots,
  };
}

/**
 * FullDiff, for GET diffs/{id}. `result` is the share of pages that changed,
 * in percent, as diffy-php reads it; it is 0 until the diff has completed.
 *
 * @param {object} diff - Mock store record.
 * @param {object} view - { state, result, diffs, s1, s2, project, host }.
 * @returns {object}
 */
function fullDiff(diff, view) {
  const { state, result, diffs, s1, s2, project, host } = view;
  const completed = state >= DIFF_STATE.COMPLETED && state !== DIFF_STATE.SNAPSHOT_IN_PROGRESS && state !== DIFF_STATE.SNAPSHOT_IN_PROGRESS_DIFF_IN_PROGRESS;
  const label = (s) => ({
    timestamp: Math.floor(s.createdAt / 1000),
    env: ENV_LABEL[s.environment] || 'Custom',
    fullEnv: s.environment,
    envUrl: s.baseUrl,
    baseline: Boolean(s.baseline),
    browserStack: false,
    id: s.id,
  });
  return {
    date: diffyDate(diff.createdAt),
    name: diff.name,
    project: { id: String(project.id), name: project.name },
    snapshot1: imageMap(s1, host),
    snapshot2: imageMap(s2, host),
    diffs: completed ? diffs : {},
    s1: label(s1),
    s2: label(s2),
    state,
    result: completed ? result : 0,
    archiveUrl: state === DIFF_STATE.ZIPFILE ? `${host}/mock/archives/${diff.token}.zip` : '',
    reviewed: { numberBugs: 0, allReviewed: false },
    diffSharedToken: diff.token,
    diffSharedUrl: `${host}/mock/share/diffs/${diff.token}`,
    status: {
      results: completed ? 1 : 0,
      items: 1,
      queue: completed ? 0 : 1,
      estimate: completed ? '' : 'under 1 minute',
      jobs: completed ? 0 : 1,
      status: completed ? 'completed' : 'in progress',
    },
  };
}

module.exports = { SNAPSHOT_STATE, DIFF_STATE, diffyDate, fullProject, fullScreenshot, fullDiff };
