'use strict';

// Test-project support, not part of the published step pack.
//
// Two lanes run the same features:
//   - mock lane (default, `npm test`): a local mock of the Diffy API is started
//     and the pack is pointed at it. Whatever DIFFY_* variables the shell
//     exports are overridden, so a real key never reaches the mock.
//   - live lane (`npm run test:live`, DIFFY_LANE=live): nothing is started; the
//     pack talks to the real API with the DIFFY_* variables of the shell.

const { BeforeAll, AfterAll } = require('@cucumber/cucumber');
const { createMockServer, stopMockServer } = require('./mock-diffy-api/server');

const live = process.env.DIFFY_LANE === 'live';

BeforeAll(async function () {
  if (live) return;
  const baseUrl = await createMockServer();
  Object.assign(process.env, {
    DIFFY_API_BASE_URL: baseUrl,
    DIFFY_API_KEY: 'mock-key',
    DIFFY_PROJECT_ID: '1001',
    DIFFY_BREAKPOINTS: '640,1200',
    DIFFY_MAX_WAIT: '30',
    DIFFY_ENV1_URL: 'https://www.example.org',
    DIFFY_ENV2_URL: 'https://stage.example.org',
  });
  // Faster states, so a wait step finishes in well under a second.
  process.env.DIFFY_MOCK_STAGE_MS = process.env.DIFFY_MOCK_STAGE_MS || '150';
});

AfterAll(async function () {
  if (!live) await stopMockServer();
});
