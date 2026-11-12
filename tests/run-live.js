#!/usr/bin/env node
'use strict';

// The live lane: runs this repository's features against the real Diffy API.
//
//   DIFFY_API_KEY=... DIFFY_PROJECT_ID=... npm run test:live
//
// Without a key and a project id nothing runs, and the exit code is 0 with a
// message that says why, so a CI job without the secrets stays green and
// honest about what it did not do.

const { spawnSync } = require('child_process');
const path = require('path');

const missing = ['DIFFY_API_KEY', 'DIFFY_PROJECT_ID'].filter((name) => !process.env[name]);
if (missing.length) {
  console.log(`Live lane skipped: ${missing.join(' and ')} not set.`);
  console.log('It runs the features against the real Diffy API, so it needs an API key');
  console.log('(https://app.diffy.website/#/keys, the account needs API access) and the');
  console.log('id of a Diffy project. The mock lane (npm test) needs neither.');
  process.exit(0);
}

const bin = process.platform === 'win32' ? 'cucumber-js.cmd' : 'cucumber-js';
const result = spawnSync(path.join(__dirname, '..', 'node_modules', '.bin', bin), ['--config', 'cucumber.js', ...process.argv.slice(2)], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
  env: Object.assign({}, process.env, { DIFFY_LANE: 'live' }),
});
process.exit(result.status === null ? 1 : result.status);
