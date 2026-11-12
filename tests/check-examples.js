#!/usr/bin/env node
'use strict';

// Checks this step pack's documentation and features against its definitions,
// without a browser:
//
//   1. every step definition in tests/step-definitions carries a JSDoc block
//      with at least five single-line "Example #n:" phrasings and a
//      "Diffy API:" line that says which API call the step makes,
//   2. every example matches its own definition and no other definition loaded
//      with it (this pack and webship-js's built-in steps), so a phrasing that
//      drifts or turns ambiguous fails the build,
//   3. every step in tests/features matches exactly one definition.
//
// Usage: node tests/check-examples.js   (npm run test:examples)

const fs = require('fs');
const path = require('path');
const { loadDir, stripKeyword } = require('./tools/step-docs');

const ROOT = path.resolve(__dirname, '..');
const PACK_DIR = path.join(ROOT, 'tests', 'step-definitions');
const FEATURES_DIR = path.join(ROOT, 'tests', 'features');
// The other step definitions cucumber.js loads next to this pack's own.
const SHARED_DIRS = [path.join(ROOT, 'node_modules', 'webship-js', 'tests', 'step-definitions')];
const MIN_EXAMPLES = 5;

const packDefs = loadDir(PACK_DIR, '');
const sharedDefs = SHARED_DIRS.reduce((all, dir) => all.concat(loadDir(dir, path.basename(path.dirname(path.dirname(dir))) + '/')), []);
const allDefs = packDefs.concat(sharedDefs).filter((d) => d.regex);
const problems = [];

for (const d of packDefs) {
  const where = `${d.file}:${d.line}`;
  if (!d.regex) problems.push(`${where}  step pattern did not compile: ${d.text}`);
  if (!d.doc) {
    problems.push(`${where}  no JSDoc block above the definition`);
  } else {
    if (d.examples.length < MIN_EXAMPLES) problems.push(`${where}  only ${d.examples.length} "Example #n:" line(s); ${MIN_EXAMPLES} are required`);
    if (!d.api) problems.push(`${where}  no "Diffy API:" line (write "none" when the step makes no API call)`);
    if (!d.description) problems.push(`${where}  no description above the examples`);
  }
  for (const example of d.examples) {
    const body = stripKeyword(example);
    const hits = allDefs.filter((o) => o.regex.test(body));
    if (!d.regex || !d.regex.test(body)) {
      problems.push(`${where}  example does not match its own definition: "${example}"`);
    }
    const others = hits.filter((o) => o !== d);
    if (others.length) {
      problems.push(`${where}  example is ambiguous, also matched by ${others.map((o) => o.file + ':' + o.line).join(', ')}: "${example}"`);
    }
  }
}

let featureSteps = 0;
if (fs.existsSync(FEATURES_DIR)) {
  for (const f of fs.readdirSync(FEATURES_DIR).filter((name) => name.endsWith('.feature'))) {
    const lines = fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const m = l.match(/^\s*(Given|When|Then|And|But|\*)\s+(.*)$/);
      if (!m) return;
      featureSteps++;
      const body = m[2].trim();
      const hits = allDefs.filter((d) => d.regex.test(body));
      if (hits.length === 0) problems.push(`${f}:${i + 1}  undefined step: ${l.trim()}`);
      else if (hits.length > 1) problems.push(`${f}:${i + 1}  ambiguous step (${hits.map((h) => h.file + ':' + h.line).join(' | ')}): ${l.trim()}`);
    });
  }
}

const exampleCount = packDefs.reduce((n, d) => n + d.examples.length, 0);
console.log(`${packDefs.length} step definitions, ${exampleCount} examples, ${featureSteps} feature steps checked against ${allDefs.length} definitions.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('All examples match their own definition only; all feature steps resolve to exactly one definition.');
