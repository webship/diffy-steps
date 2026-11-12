'use strict';

// Reads step definitions and their docblocks from source, without loading
// them. Shared by tests/check-examples.js (checks) and tests/generate-docs.js
// (writes docs/steps).

const fs = require('fs');
const path = require('path');

/**
 * Turn a Cucumber expression into a RegExp, for step files that use them.
 *
 * @param {string} expression
 * @returns {RegExp}
 */
function cucumberExpressionToRegex(expression) {
  let s = expression.replace(/[.*+?^$|[\]\\]/g, '\\$&');
  s = s.replace(/\(([^)]*)\)/g, '(?:$1)?');
  s = s.replace(/\b(\w+(?:\/\w+)+)\b/g, (m) => '(?:' + m.split('/').join('|') + ')');
  s = s.replace(/\{string\}/g, '(?:"[^"]*"|\'[^\']*\')');
  s = s.replace(/\{int\}/g, '-?\\d+');
  s = s.replace(/\{float\}/g, '-?\\d*\\.?\\d+');
  s = s.replace(/\{word\}/g, '[^\\s]+');
  s = s.replace(/\{\}/g, '.*');
  return new RegExp('^' + s + '$');
}

/**
 * Find the Given, When, Then and defineStep calls of a source file, with the
 * JSDoc block directly above each.
 *
 * @param {string} source
 * @param {string} file - Label for messages.
 * @returns {{file: string, line: number, keyword: string, text: string, regex: (RegExp|null), doc: (string|null), examples: string[], description: string, api: (string|null)}[]}
 */
function extractDefinitions(source, file) {
  const definitions = [];
  const re = /(?:^|\n)[ \t]*(Given|When|Then|defineStep)\(\s*(?:\/((?:\\\/|[^/\n])+)\/([a-z]*)|'((?:\\'|[^'\n])*)'|"((?:\\"|[^"\n])*)"|`([^`\n]*)`)/g;
  let m;
  while ((m = re.exec(source))) {
    const index = m.index + (m[0].startsWith('\n') ? 1 : 0);
    const line = source.slice(0, index).split('\n').length;
    let regex = null;
    let text;
    if (m[2] !== undefined) {
      text = '/' + m[2] + '/' + m[3];
      try { regex = new RegExp(m[2], m[3]); } catch (e) { regex = null; }
    } else {
      text = m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : m[6]);
      try { regex = cucumberExpressionToRegex(text); } catch (e) { regex = null; }
    }
    const before = source.slice(0, index);
    const docEnd = before.lastIndexOf('*/');
    let doc = null;
    if (docEnd !== -1 && /^\s*$/.test(before.slice(docEnd + 2))) {
      const docStart = before.lastIndexOf('/**', docEnd);
      if (docStart !== -1) doc = before.slice(docStart, docEnd + 2);
    }
    const examples = [];
    const prose = [];
    let api = null;
    if (doc) {
      for (const raw of doc.split('\n')) {
        const l = raw.replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, '').trimEnd();
        const em = l.match(/^Example\s*#?\d*\s*:\s*(.*)$/);
        const am = l.match(/^Diffy API:\s*(.*)$/);
        if (em) examples.push(em[1].trim());
        else if (am) api = am[1].trim();
        else prose.push(l);
      }
    }
    const description = prose.join('\n').replace(/^\s+|\s+$/g, '').split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean).join('\n\n');
    definitions.push({ file, line, keyword: m[1], text, regex, doc, examples, description, api });
  }
  return definitions;
}

/**
 * Definitions of every .js file in a folder.
 *
 * @param {string} dir
 * @param {string} label - Prefix of the file name in messages.
 * @returns {object[]}
 */
function loadDir(dir, label) {
  if (!fs.existsSync(dir)) return [];
  let defs = [];
  for (const f of fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort()) {
    defs = defs.concat(extractDefinitions(fs.readFileSync(path.join(dir, f), 'utf8'), label + f));
  }
  return defs;
}

/**
 * Remove the leading Given, When, Then, And, But or * of a feature or example line.
 *
 * @param {string} s
 * @returns {string}
 */
function stripKeyword(s) {
  return s.replace(/^(Given|When|Then|And|But|\*)\s+/, '').trim();
}

module.exports = { cucumberExpressionToRegex, extractDefinitions, loadDir, stripKeyword };
