'use strict';

// Test-project support, not part of the published step pack.
//
// Serves the example pages (examples/) on the port of LAUNCH_URL, so a run
// needs no second process. Nothing is started when LAUNCH_URL points at a
// real host, or when something already answers on that port.

const { BeforeAll, AfterAll } = require('@cucumber/cucumber');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'examples');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
let server = null;

function target() {
  try {
    const url = new URL(process.env.LAUNCH_URL || 'http://localhost:8080');
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? { host: url.hostname, port: parseInt(url.port || '80', 10) } : null;
  } catch (e) {
    return null;
  }
}

function serves(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/diffy/baseline.html', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

BeforeAll(async function () {
  const t = target();
  if (!t || (await serves(t.host, t.port))) return;
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      server = null;
      reject(error.code === 'EADDRINUSE'
        ? new Error(`Port ${t.port} is in use by another program that does not serve the example pages. Set LAUNCH_URL to a free port, for example LAUNCH_URL=http://localhost:8765.`)
        : error);
    });
    server.listen(t.port, t.host, resolve);
  });
});

AfterAll(async function () {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});
