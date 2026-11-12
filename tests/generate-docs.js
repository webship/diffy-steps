#!/usr/bin/env node
'use strict';

// Writes docs/steps/*.md, one page per step, and the step table of
// docs/README.md from the docblocks in tests/step-definitions.
//
//   node tests/generate-docs.js           write the pages   (npm run docs)
//   node tests/generate-docs.js --check   fail when a page is missing, stale or left over   (npm run docs:check)

const fs = require('fs');
const path = require('path');
const { loadDir, stripKeyword } = require('./tools/step-docs');

const ROOT = path.resolve(__dirname, '..');
const STEPS_DIR = path.join(ROOT, 'docs', 'steps');
const INDEX = path.join(ROOT, 'docs', 'README.md');
const START = '<!-- steps:start -->';
const END = '<!-- steps:end -->';
const check = process.argv.includes('--check');

/** The step as a title: the first example, with quoted values as "<value>". */
function title(definition) {
  return definition.examples[0].replace(/"[^"]*"/g, '"<value>"');
}

function slug(text) {
  return text.toLowerCase().replace(/<value>/g, 'value').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function page(definition) {
  const lines = [
    `# ${title(definition)}`,
    '',
    '> Generated from the docblock of the step in `tests/step-definitions/' + definition.file + '`. Edit the docblock and run `npm run docs`.',
    '',
    '## Overview',
    '',
    definition.description,
    '',
    '## Diffy API',
    '',
    definition.api,
    '',
    '## Gherkin step pattern',
    '',
    '```',
    definition.text,
    '```',
    '',
    '## Examples',
    '',
    '```gherkin',
    ...definition.examples,
    '```',
    '',
  ];
  return lines.join('\n');
}

const definitions = loadDir(path.join(ROOT, 'tests', 'step-definitions'), '').filter((d) => d.doc && d.examples.length);
const pages = new Map();
for (const d of definitions) {
  let name = slug(title(d));
  while (pages.has(name)) name += '-2';
  pages.set(name, { definition: d, content: page(d) });
}

const table = ['| Step | Page |', '| --- | --- |']
  .concat([...pages].map(([name, { definition }]) => `| \`${title(definition)}\` | [${name}](steps/${name}.md) |`))
  .join('\n');
const index = fs.readFileSync(INDEX, 'utf8');
if (!index.includes(START) || !index.includes(END)) {
  console.error(`docs/README.md needs the markers ${START} and ${END} around the step table.`);
  process.exit(1);
}
const newIndex = index.slice(0, index.indexOf(START) + START.length) + '\n' + table + '\n' + index.slice(index.indexOf(END));

const stale = [];
const existing = fs.existsSync(STEPS_DIR) ? fs.readdirSync(STEPS_DIR).filter((f) => f.endsWith('.md')) : [];
for (const [name, { content }] of pages) {
  const file = path.join(STEPS_DIR, `${name}.md`);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) stale.push(`docs/steps/${name}.md`);
}
for (const f of existing) if (!pages.has(f.replace(/\.md$/, ''))) stale.push(`docs/steps/${f} (no step writes it any more)`);
if (newIndex !== index) stale.push('docs/README.md (step table)');

if (check) {
  if (stale.length) {
    console.error(`${stale.length} documentation file(s) are out of date. Run: npm run docs\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Documentation is up to date: ${pages.size} step pages.`);
} else {
  fs.mkdirSync(STEPS_DIR, { recursive: true });
  for (const f of existing) if (!pages.has(f.replace(/\.md$/, ''))) fs.rmSync(path.join(STEPS_DIR, f));
  for (const [name, { content }] of pages) fs.writeFileSync(path.join(STEPS_DIR, `${name}.md`), content);
  fs.writeFileSync(INDEX, newIndex);
  console.log(`Wrote ${pages.size} step pages and the step table of docs/README.md.`);
}
