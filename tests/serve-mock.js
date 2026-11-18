'use strict';

// Serve the mock Diffy API on its own, for a test project outside this
// repository (README, "From nothing to a green run"): the same mock the suite of
// this repository starts for itself, at a fixed address. It lives outside
// tests/support/, which cucumber.js loads: loading it would start the server.
//
//   npm run mock                      # http://127.0.0.1:8790/api/
//   DIFFY_MOCK_PORT=8791 npm run mock
//
// The key is "mock-key" and the project id 1001. Nothing leaves the machine:
// the mock keeps the screenshot sets and comparisons in memory, compares the
// uploaded images pixel by pixel, and forgets everything when it stops (Ctrl+C).

const { createMock } = require('./support/mock-diffy-api/server');

const port = parseInt(process.env.DIFFY_MOCK_PORT || '8790', 10);
const mock = createMock();

mock.listen(port).then((baseUrl) => {
  console.log(`Mock Diffy API at ${baseUrl} (key "${mock.apiKey}", project 1001). Ctrl+C stops it.`);
}, (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is in use. Set DIFFY_MOCK_PORT to a free port.`
    : error.message);
  process.exit(1);
});
