'use strict';

// Test-project support, not part of the published step pack.
//
// Scenarios that need something only a configured Diffy project can provide
// are skipped, with the reason, in the live lane when it is not set up. The
// mock lane always has what they need.
//
//   @project-environments  the project has production and staging URLs that
//                          Diffy can reach. Set DIFFY_LIVE_PROJECT_ENVIRONMENTS=1.
//   @remote-url            a URL Diffy can reach, for the custom environment.
//                          Set DIFFY_ENV1_URL and DIFFY_ENV2_URL.
//   @sets-baseline         replaces the baseline of the project, so it only runs
//                          live with DIFFY_LIVE_SET_BASELINE=1 (use a test project).
//   @mock-only             needs the mock (injected failures); never runs live.

const { Before } = require('@cucumber/cucumber');

const live = process.env.DIFFY_LANE === 'live';

function skip(world, reason) {
  if (world.attach) world.attach(`Skipped in the live lane: ${reason}`);
  return 'skipped';
}

Before({ tags: '@project-environments' }, function () {
  if (live && process.env.DIFFY_LIVE_PROJECT_ENVIRONMENTS !== '1') {
    return skip(this, 'set DIFFY_LIVE_PROJECT_ENVIRONMENTS=1 when the project has production and staging URLs Diffy can reach.');
  }
  return undefined;
});

Before({ tags: '@remote-url' }, function () {
  if (live && !(process.env.DIFFY_ENV1_URL && process.env.DIFFY_ENV2_URL)) {
    return skip(this, 'set DIFFY_ENV1_URL and DIFFY_ENV2_URL to two URLs Diffy can reach.');
  }
  return undefined;
});

Before({ tags: '@sets-baseline' }, function () {
  if (live && process.env.DIFFY_LIVE_SET_BASELINE !== '1') {
    return skip(this, 'the scenario replaces the baseline of the project. Set DIFFY_LIVE_SET_BASELINE=1 with a project made for testing.');
  }
  return undefined;
});

Before({ tags: '@mock-only' }, function () {
  if (live) return skip(this, 'the scenario needs the mock Diffy API.');
  return undefined;
});
