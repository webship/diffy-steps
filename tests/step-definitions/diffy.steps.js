'use strict';

// ---------------------------------------------------------------------------
// @webship-js/diffy-steps — Diffy visual-regression step definitions for webship-js
//
// Plugin for webship-js (https://www.npmjs.com/package/webship-js): relies on
// the World it installs (this.page, this.parameters) and adds nothing to it.
//
// Talks to the Diffy REST API (https://app.diffy.website/api/, documented at
// https://app.diffy.website/rest) through diffy-client.js.
//
// Configuration, resolved for each scenario in this order:
//   1. process.env.DIFFY_*                    (shell or CI: highest)
//   2. cucumber.js worldParameters.diffy.*    (project defaults)
//   3. built-in defaults
//
// Variables and worldParameters keys:
//   DIFFY_API_KEY          apiKey          — https://app.diffy.website/#/keys
//   DIFFY_PROJECT_ID       projectId       — Diffy project id
//   DIFFY_BREAKPOINTS      breakpoints     — comma list, e.g. "640,1200"
//   DIFFY_WINDOW_HEIGHT    windowHeight    — viewport height, default 2000
//   DIFFY_SCREENSHOTS_DIR  screenshotsDir  — on-disk copy of captured screenshots
//   DIFFY_API_BASE_URL     baseUrl         — default https://app.diffy.website/api/
//   DIFFY_MAX_WAIT         maxWait         — seconds a wait step polls, default 1200
//   DIFFY_POLL_INTERVAL    pollInterval    — seconds between polls, default 10
//   DIFFY_REQUEST_TIMEOUT  requestTimeout  — seconds one API call may take, default 120
//   DIFFY_FUNCTIONAL_TEST  functionalTest  — default true: uploaded pages need not be in the project URL list
//   DIFFY_COMMIT_SHA       commitSha       — sent with environment comparisons (GitHub check)
//   DIFFY_ENV1_URL / DIFFY_ENV2_URL                 env1Url / env2Url
//   DIFFY_ENV1_USER / DIFFY_ENV1_PASS (and ENV2)    basic-auth login of a custom environment
// ---------------------------------------------------------------------------

const { When, Then, Before } = require('@cucumber/cucumber');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { friendly, smartSettle } = require('webship-js/tests/step-definitions/webship');
const { DiffyClient, resolveConfig, summarize, changedPages } = require('./diffy-client');
const { collectFolderImages } = require('./diffy-images');

/**
 * The path of the current page as Diffy files it: relative to the launch URL.
 *
 * @param {import('playwright').Page} page
 * @param {string} launchUrl
 * @returns {string}
 */
function currentPath(page, launchUrl) {
  try {
    const current = new URL(page.url());
    const base = launchUrl ? new URL(launchUrl) : null;
    if (base && current.origin === base.origin) {
      const prefix = base.pathname.replace(/\/+$/, '');
      const rest = current.pathname.startsWith(prefix) ? current.pathname.slice(prefix.length) : current.pathname;
      return (rest.startsWith('/') ? rest : `/${rest}`) + current.search;
    }
    return current.pathname + current.search;
  } catch (e) {
    return '/';
  }
}

/**
 * The width of the browser viewport, which is the width of a full-page
 * screenshot and so the breakpoint it is filed under.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<number>}
 */
async function viewportWidth(page) {
  const size = page.viewportSize();
  return size ? size.width : page.evaluate(() => window.innerWidth);
}

/**
 * Capture the current page as a full-page PNG and keep it for the next upload.
 * The page is settled first, CSS animations are stopped and the text caret is
 * hidden, so two captures of an unchanged page are the same image. Capturing
 * the same page at the same width again replaces the earlier capture.
 *
 * @param {object} world
 * @returns {Promise<void>}
 */
async function capture(world) {
  const cfg = world.diffyConfig;
  const page = world.page;
  if (!page || page.url() === 'about:blank') {
    throw friendly({
      message: 'There is no page to take a screenshot of.',
      hint: 'Open a page first, for example: Given I am on "/".',
    });
  }
  await smartSettle(page, (world.minWaitTime && world.minWaitTime.page) || 3000);
  const breakpoint = await viewportWidth(page);
  const buffer = await page.screenshot({ fullPage: true, type: 'png', animations: 'disabled', caret: 'hide' });
  const url = currentPath(page, world.launchUrl);

  if (cfg.screenshotsDir) {
    fs.mkdirSync(cfg.screenshotsDir, { recursive: true });
    const file = path.join(cfg.screenshotsDir, `${Date.now()}__${encodeURIComponent(url)}__${breakpoint}.png`);
    fs.writeFileSync(file, buffer);
    world.diffyFiles.push(file);
  }

  const shot = { buffer, url, breakpoint, filename: `${encodeURIComponent(url)}__${breakpoint}.png`, contentType: 'image/png' };
  const same = world.diffyScreenshots.findIndex((s) => s.url === url && s.breakpoint === breakpoint);
  if (same === -1) world.diffyScreenshots.push(shot);
  else world.diffyScreenshots[same] = shot;
}

/**
 * The id of the last screenshot set created in this scenario, or an error that
 * tells the tester which step to put first.
 *
 * @param {object} world
 * @returns {number[]} The ids, oldest first.
 */
function screenshotIds(world, needed) {
  const ids = world.diffyCreatedScreenshotIds;
  if (ids.length < needed) {
    throw friendly({
      message: needed === 1
        ? 'No Diffy screenshot set exists yet in this scenario.'
        : `A comparison needs two Diffy screenshot sets, and this scenario has ${ids.length}.`,
      hint: 'Create them first with "send screenshots to diffy with name ...", "upload folder ... to diffy as ..." or "create diffy screenshot from ... environment".',
    });
  }
  return ids;
}

/**
 * The finished data of the last comparison of this scenario. The comparison is
 * waited for when no step has waited for it yet.
 *
 * @param {object} world
 * @returns {Promise<{id: number, diff: object}>}
 */
async function finishedDiff(world) {
  const ids = world.diffyCreatedDiffIds;
  if (!ids.length) {
    throw friendly({
      message: 'No Diffy comparison has been created in this scenario.',
      hint: 'Create one first with "create diffy comparison" or "compare diffy ... with ...".',
    });
  }
  const id = ids[ids.length - 1];
  if (!world.diffyLastDiff || world.diffyLastDiffId !== id) {
    world.diffyLastDiff = await world.diffy.waitForDiff(id);
    world.diffyLastDiffId = id;
  }
  return { id, diff: world.diffyLastDiff };
}

/**
 * The changed pages of a diff as text, for an error message.
 *
 * @param {object} diff
 * @returns {string}
 */
function listChanges(diff) {
  const changed = changedPages(diff);
  const shown = changed.slice(0, 10).map((c) => `${c.url} at ${c.breakpoint}: ${c.percentage}%`).join('; ');
  return changed.length > 10 ? `${shown}; and ${changed.length - 10} more` : shown;
}

Before(async function () {
  this.diffyConfig = resolveConfig(this.parameters);
  this.diffy = new DiffyClient(this.diffyConfig);
  this.diffyScreenshots = [];
  this.diffyFiles = [];
  this.diffyCreatedScreenshotIds = [];
  this.diffyCreatedDiffIds = [];
  this.diffyLastDiff = null;
  this.diffyLastDiffId = null;
});

/**
 * Resize the browser viewport to a breakpoint width, so a page is laid out at
 * that width. The height is DIFFY_WINDOW_HEIGHT.
 *
 * Diffy API: none (Playwright viewport)
 *
 * Example #1: When I resize window to "1200"
 * Example #2: When we resize window to "640"
 * Example #3: When I resize window to "320"
 * Example #4: When we resize window to "768"
 * Example #5: When I resize window to "1024"
 * Example #6: When we resize window to "1440"
 * Example #7: When I resize window to "1920"
 * Example #8: When we resize window to "375"
 *
 */
When(/^(I |we )*resize window to "([^"]*)"$/, async function (pronounCase, breakpoint) {
  const width = parseInt(breakpoint, 10);
  if (!/^\d+$/.test(breakpoint.trim()) || width < 200) {
    throw friendly({
      message: `"${breakpoint}" is not a breakpoint width.`,
      hint: 'Use a width in pixels, for example: When I resize window to "1200".',
    });
  }
  await this.page.setViewportSize({ width, height: this.diffyConfig.windowHeight });
});

/**
 * Capture a full-page screenshot of the current page at the current viewport
 * width. The page is settled first and animations are stopped. The image is
 * kept in memory (and in DIFFY_SCREENSHOTS_DIR when set) until "send
 * screenshots to diffy with name" uploads the batch. Taking the same page at
 * the same width again replaces the earlier image.
 *
 * Diffy API: none (Playwright screenshot, kept in memory until it is sent)
 *
 * Example #1: Then I take screenshot
 * Example #2: Then we take screenshot
 * Example #3: And I take screenshot
 * Example #4: And we take screenshot
 * Example #5: But I take screenshot
 * Example #6: Then take screenshot
 * Example #7: And take screenshot
 *
 */
Then(/^(I |we )*take screenshot$/, async function (pronounCase) {
  await capture(this);
});

/**
 * Resize to each configured breakpoint and capture the current page at each.
 * The breakpoints come from DIFFY_BREAKPOINTS or worldParameters.diffy.breakpoints.
 *
 * Diffy API: none (Playwright screenshots, kept in memory until they are sent)
 *
 * Example #1: Then I take screenshots for all breakpoints
 * Example #2: Then we take screenshots for all breakpoints
 * Example #3: And I take screenshots for all breakpoints
 * Example #4: And we take screenshots for all breakpoints
 * Example #5: Then take screenshots for all breakpoints
 * Example #6: And take screenshots for all breakpoints
 *
 */
Then(/^(I |we )*take screenshots for all breakpoints$/, async function (pronounCase) {
  const cfg = this.diffyConfig;
  if (!cfg.breakpoints.length) {
    throw friendly({
      message: 'No Diffy breakpoints are configured.',
      hint: 'Export DIFFY_BREAKPOINTS, for example "640,1200", or set diffy.breakpoints in cucumber.js.',
    });
  }
  for (const width of cfg.breakpoints) {
    await this.page.setViewportSize({ width, height: cfg.windowHeight });
    await capture(this);
  }
});

/**
 * Upload the captured screenshots to Diffy as one named screenshot set. The
 * set is marked as a functional-test upload, so the pages need not be in the
 * project URL list (DIFFY_FUNCTIONAL_TEST=false turns that off). More than ten
 * images are sent in batches. On success the captured screenshots, and the
 * files this pack wrote to DIFFY_SCREENSHOTS_DIR, are cleared.
 *
 * Diffy API: POST projects/{id}/create-custom-snapshot (multipart), and PUT snapshots/{id} for batches after the first ten images
 *
 * Example #1: Then send screenshots to diffy with name "baseline"
 * Example #2: Then send screenshots to diffy with name "changed"
 * Example #3: Then send screenshots to diffy with name "homepage-release-2.0"
 * Example #4: Then send screenshots to diffy with name "after-deploy"
 * Example #5: Then send screenshots to diffy with name "smoke-run"
 * Example #6: Then send screenshots to diffy with name "webship.co-prod"
 *
 */
Then(/^(I |we )*send screenshots to diffy with name "([^"]*)"$/, async function (pronounCase, snapshotName) {
  if (!this.diffyScreenshots.length) {
    throw friendly({
      message: 'There are no captured screenshots to send.',
      hint: 'Take some first: "I take screenshot" or "I take screenshots for all breakpoints".',
    });
  }
  const id = await this.diffy.uploadSnapshot(snapshotName, this.diffyScreenshots, { functionalTest: this.diffyConfig.functionalTest });
  this.diffyCreatedScreenshotIds.push(id);
  for (const file of this.diffyFiles) fs.rmSync(file, { force: true });
  this.diffyFiles = [];
  this.diffyScreenshots = [];
});

/**
 * Compare the last two screenshot sets of this scenario in Diffy.
 *
 * Diffy API: POST projects/{id}/diffs
 *
 * Example #1: Then create diffy comparison
 * Example #2: And create diffy comparison
 * Example #3: Then I create diffy comparison
 * Example #4: Then we create diffy comparison
 * Example #5: And I create diffy comparison
 * Example #6: And we create diffy comparison
 * Example #7: But I create diffy comparison
 *
 */
Then(/^(I |we )*create diffy comparison$/, async function (pronounCase) {
  const ids = screenshotIds(this, 2);
  this.diffyCreatedDiffIds.push(await this.diffy.createDiff(ids[ids.length - 2], ids[ids.length - 1]));
});

/**
 * Compare the last two screenshot sets of this scenario in Diffy and give the
 * comparison a name, which Diffy shows in its list and in notifications.
 *
 * Diffy API: POST projects/{id}/diffs
 *
 * Example #1: Then create diffy comparison with name "release-2.0"
 * Example #2: Then create diffy comparison with name "nightly"
 * Example #3: Then create diffy comparison with name "smoke-run-42"
 * Example #4: Then create diffy comparison with name "webship.co-regression"
 * Example #5: Then create diffy comparison with name "before-vs-after"
 * Example #6: Then create diffy comparison with name "homepage-baseline-vs-changed"
 *
 */
Then(/^(I |we )*create diffy comparison with name "([^"]*)"$/, async function (pronounCase, name) {
  const ids = screenshotIds(this, 2);
  this.diffyCreatedDiffIds.push(await this.diffy.createDiff(ids[ids.length - 2], ids[ids.length - 1], name));
});

/**
 * Ask Diffy to capture the project's pages from one of the project's
 * environments. Accepts short (prod, stage, dev) or long (production, staging,
 * development) names, and "custom", which captures DIFFY_ENV1_URL.
 *
 * Diffy API: POST projects/{id}/screenshots
 *
 * Example #1: Then create diffy screenshot from "production" environment
 * Example #2: Then create diffy screenshot from "prod" environment
 * Example #3: Then create diffy screenshot from "staging" environment
 * Example #4: Then create diffy screenshot from "stage" environment
 * Example #5: Then create diffy screenshot from "development" environment
 * Example #6: Then create diffy screenshot from "dev" environment
 * Example #7: Then create diffy screenshot from "custom" environment
 *
 */
Then(/^(I |we )*create diffy screenshot from "([^"]*)" environment$/, async function (pronounCase, environment) {
  const id = await this.diffy.createScreenshot(environment, this.diffyConfig.env1Url);
  this.diffyCreatedScreenshotIds.push(id);
});

/**
 * Ask Diffy to capture the project's pages from a site at an address you give,
 * the custom environment. The site must be reachable from Diffy.
 *
 * Diffy API: POST projects/{id}/screenshots
 *
 * Example #1: Then create diffy screenshot from the custom environment "https://stage.example.org"
 * Example #2: And create diffy screenshot from the custom environment "https://www.un.org"
 * Example #3: Then I create diffy screenshot from the custom environment "https://pr-42.example.org"
 * Example #4: Then we create diffy screenshot from the custom environment "https://example.org"
 * Example #5: But I create diffy screenshot from the custom environment "https://example.net"
 *
 */
Then(/^(I |we )*create diffy screenshot from the custom environment "([^"]*)"$/, async function (pronounCase, url) {
  const id = await this.diffy.createScreenshot('custom', url);
  this.diffyCreatedScreenshotIds.push(id);
});

/**
 * Let Diffy capture two environments of the project and compare them. The
 * environments are prod, stage, dev, baseline and custom (long names work as
 * well). For "custom" the address comes from DIFFY_ENV1_URL or DIFFY_ENV2_URL,
 * with DIFFY_ENV1_USER and DIFFY_ENV1_PASS (or ENV2) for basic authentication.
 * DIFFY_COMMIT_SHA is sent along for a GitHub check. An optional name labels
 * the comparison.
 *
 * Diffy API: POST projects/{id}/compare
 *
 * Example #1: Then compare diffy "prod" with "stage"
 * Example #2: Then compare diffy "production" with "staging"
 * Example #3: Then compare diffy "prod" with "dev"
 * Example #4: Then compare diffy "stage" with "dev" with name "release-2.0"
 * Example #5: Then compare diffy "prod" with "baseline"
 * Example #6: Then compare diffy "baseline" with "custom"
 * Example #7: Then compare diffy "custom" with "custom"
 * Example #8: Then compare diffy "production" with "development"
 *
 */
Then(/^(I |we )*compare diffy "([^"]*)" with "([^"]*)"(?: with name "([^"]*)")?$/, async function (pronounCase, env1, env2, name) {
  const cfg = this.diffyConfig;
  const id = await this.diffy.compare(env1, env2, {
    name,
    commitSha: cfg.commitSha,
    env1Url: cfg.env1Url,
    env2Url: cfg.env2Url,
    env1User: cfg.env1User,
    env1Pass: cfg.env1Pass,
    env2User: cfg.env2User,
    env2Pass: cfg.env2Pass,
  });
  this.diffyCreatedDiffIds.push(id);
});

/**
 * Upload every PNG and WebP image under a local folder as one named screenshot
 * set, the way Diffy's own CLI does. The breakpoint is the width of the image,
 * and the URL Diffy files it under comes from its path: "home/Page One.png"
 * becomes "/home-page-one". The set is a functional-test upload.
 *
 * Diffy API: POST projects/{id}/create-custom-snapshot (multipart), and PUT snapshots/{id} for batches after the first ten images
 *
 * Example #1: Then upload folder "./screenshots/baseline" to diffy as "baseline"
 * Example #2: Then upload folder "./screenshots/changed" to diffy as "changed"
 * Example #3: Then upload folder "./reports/screenshots" to diffy as "nightly"
 * Example #4: Then upload folder "/tmp/webship-shots" to diffy as "webship.co-snapshot"
 * Example #5: Then upload folder "./out/homepage" to diffy as "homepage-release-2.0"
 * Example #6: Then upload folder "./diffy/before" to diffy as "before-deploy"
 *
 */
Then(/^(I |we )*upload folder "([^"]*)" to diffy as "([^"]*)"$/, async function (pronounCase, folderPath, snapshotName) {
  let images;
  try {
    images = collectFolderImages(folderPath);
  } catch (e) {
    throw friendly({
      message: e.message,
      hint: e.code === 'NO_FOLDER' ? 'The path is relative to the folder you run the tests from.' : 'Use PNG or WebP images that are not damaged.',
    });
  }
  if (!images.length) {
    throw friendly({ message: `There are no PNG or WebP images in ${folderPath}.`, hint: 'Diffy takes .png and .webp files, also in subfolders.' });
  }
  const id = await this.diffy.uploadSnapshot(snapshotName, images, { functionalTest: true });
  this.diffyCreatedScreenshotIds.push(id);
});

/**
 * Wait until the last comparison created in this scenario is complete in
 * Diffy. It polls every DIFFY_POLL_INTERVAL seconds, for at most DIFFY_MAX_WAIT
 * seconds, and fails at once when Diffy stops the comparison. The result and
 * the report link are added to the test report.
 *
 * Diffy API: GET diffs/{id} (polling)
 *
 * Example #1: Then wait for diffy comparison to complete
 * Example #2: And wait for diffy comparison to complete
 * Example #3: Then I wait for diffy comparison to complete
 * Example #4: Then we wait for diffy comparison to complete
 * Example #5: And I wait for diffy comparison to complete
 * Example #6: And we wait for diffy comparison to complete
 * Example #7: But I wait for diffy comparison to complete
 *
 */
Then(/^(I |we )*wait for diffy comparison to complete$/, { timeout: -1 }, async function (pronounCase) {
  const ids = this.diffyCreatedDiffIds;
  if (!ids.length) {
    throw friendly({
      message: 'No Diffy comparison has been created in this scenario.',
      hint: 'Create one first with "create diffy comparison" or "compare diffy ... with ...".',
    });
  }
  const id = ids[ids.length - 1];
  const diff = await this.diffy.waitForDiff(id);
  this.diffyLastDiff = diff;
  this.diffyLastDiffId = id;
  this.attach(summarize(id, diff));
});

/**
 * Wait until the last screenshot set of this scenario is complete in Diffy.
 * Needed after "create diffy screenshot from ... environment", which only
 * starts the capture; an uploaded set needs no waiting for. It polls every
 * DIFFY_POLL_INTERVAL seconds, for at most DIFFY_MAX_WAIT seconds.
 *
 * Diffy API: GET snapshots/{id} (polling)
 *
 * Example #1: Then wait for diffy screenshots to complete
 * Example #2: And wait for diffy screenshots to complete
 * Example #3: Then I wait for diffy screenshots to complete
 * Example #4: Then we wait for diffy screenshots to complete
 * Example #5: And I wait for diffy screenshots to complete
 * Example #6: But we wait for diffy screenshots to complete
 *
 */
Then(/^(I |we )*wait for diffy screenshots to complete$/, { timeout: -1 }, async function (pronounCase) {
  const ids = screenshotIds(this, 1);
  const id = ids[ids.length - 1];
  const screenshot = await this.diffy.waitForScreenshot(id);
  this.attach(`Diffy screenshot set ${id} is complete${screenshot.name ? `: "${screenshot.name}"` : ''}.`);
});

/**
 * Assert that the last comparison found changes, or found none. "Changes"
 * means Diffy reports a percentage of changed pages above zero, or any page
 * with changed pixels. The comparison is waited for when no step has waited
 * for it. A failure lists the changed pages and the report link.
 *
 * Diffy API: GET diffs/{id}
 *
 * Example #1: Then the diffy comparison should have changes
 * Example #2: And the diffy comparison should have changes
 * Example #3: Then the diffy comparison should not have changes
 * Example #4: And the diffy comparison should not have changes
 * Example #5: But the diffy comparison should not have changes
 *
 */
Then(/^the diffy comparison should( not)* have changes$/, { timeout: -1 }, async function (notCase) {
  const { id, diff } = await finishedDiff(this);
  const result = Number(diff.result) || 0;
  const changed = result > 0 || changedPages(diff).length > 0;
  const report = diff.diffSharedUrl ? `Report: ${diff.diffSharedUrl}` : undefined;
  assert.ok(
    notCase ? !changed : changed,
    friendly(notCase
      ? { message: `Expected Diffy comparison ${id} to show no changes, but ${result}% of the pages changed.`, cause: listChanges(diff), hint: report }
      : { message: `Expected Diffy comparison ${id} to show changes, but Diffy found none.`, cause: 'the two screenshot sets are the same', hint: 'Check that the two sets were taken from different pages or environments.' }
    ).message
  );
});

/**
 * Assert that the share of pages that changed in the last comparison, as
 * Diffy reports it in percent, is at most a number. Use "0" for no change at
 * all. The comparison is waited for when no step has waited for it.
 *
 * Diffy API: GET diffs/{id}
 *
 * Example #1: Then the diffy comparison should have at most "0" percent of pages changed
 * Example #2: And the diffy comparison should have at most "5" percent of pages changed
 * Example #3: Then the diffy comparison should have at most "10" percent of pages changed
 * Example #4: And the diffy comparison should have at most "25" percent of pages changed
 * Example #5: Then the diffy comparison should have at most "100" percent of pages changed
 *
 */
Then(/^the diffy comparison should have at most "([^"]*)" percent of pages changed$/, { timeout: -1 }, async function (limit) {
  const max = Number(limit);
  if (!/^\d+(\.\d+)?$/.test(limit.trim()) || max > 100) {
    throw friendly({ message: `"${limit}" is not a percentage.`, hint: 'Use a number from 0 to 100, for example: at most "5" percent of pages changed.' });
  }
  const { id, diff } = await finishedDiff(this);
  const result = Number(diff.result) || 0;
  assert.ok(
    result <= max,
    friendly({
      message: `Expected at most ${max}% of the pages of Diffy comparison ${id} to change, but ${result}% changed.`,
      cause: listChanges(diff),
      hint: diff.diffSharedUrl ? `Report: ${diff.diffSharedUrl}` : undefined,
    }).message
  );
});

/**
 * Make the last screenshot set of this scenario the baseline of the Diffy
 * project, which "compare diffy ... with "baseline"" compares against. This
 * replaces the baseline the project had.
 *
 * Diffy API: PUT projects/{id}/set-base-line-set/{screenshotId}
 *
 * Example #1: Then set the last diffy screenshots as the baseline
 * Example #2: And set the last diffy screenshots as the baseline
 * Example #3: Then I set the last diffy screenshots as the baseline
 * Example #4: Then we set the last diffy screenshots as the baseline
 * Example #5: And I set the last diffy screenshots as the baseline
 * Example #6: But we set the last diffy screenshots as the baseline
 *
 */
Then(/^(I |we )*set the last diffy screenshots as the baseline$/, async function (pronounCase) {
  const ids = screenshotIds(this, 1);
  await this.diffy.setBaseline(ids[ids.length - 1]);
});

/**
 * Check that the Diffy API key, the account's API access and the project id
 * work together, by reading the project. Put it first in a feature so a wrong
 * key or project id fails with a hint before any capture is made.
 *
 * Diffy API: GET projects/{id}
 *
 * Example #1: Given the diffy project is reachable
 * Example #2: Then the diffy project should be reachable
 * Example #3: And the diffy project is reachable
 * Example #4: And the diffy project should be reachable
 * Example #5: But the diffy project is reachable
 *
 */
Then(/^the diffy project (?:is|should be) reachable$/, async function () {
  const project = await this.diffy.getProject();
  this.attach(`Diffy project ${this.diffyConfig.projectId}${project && project.name ? `: "${project.name}"` : ''} is reachable.`);
});
