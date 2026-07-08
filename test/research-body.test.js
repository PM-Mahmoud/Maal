'use strict';

// test/research-body.test.js
// Deterministic tests for db/research.js researchBodyFromReport() — maps the
// Markdown report string into the structured body the React view renders. No DB.

const assert = require('assert');
const { researchBodyFromReport } = require('../db/research');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nresearchBodyFromReport');

test('splits markdown headings into sections; preamble becomes summary', () => {
  const md = 'Quick take on rates.\n\n## Background\nThe RBA held.\n\n## What it means\nBorrowing power steady.';
  const b = researchBodyFromReport('Rates?', md, []);
  assert.strictEqual(b.title, 'Rates?');
  assert.strictEqual(b.summary, 'Quick take on rates.');
  assert.strictEqual(b.sections.length, 2);
  assert.deepStrictEqual(b.sections[0], { heading: 'Background', body: 'The RBA held.' });
  assert.strictEqual(b.sections[1].heading, 'What it means');
});

test('no headings → single "Report" section, empty summary', () => {
  const b = researchBodyFromReport('Q', 'Just one paragraph of analysis.', []);
  assert.strictEqual(b.summary, '');
  assert.strictEqual(b.sections.length, 1);
  assert.strictEqual(b.sections[0].heading, 'Report');
  assert.strictEqual(b.sections[0].body, 'Just one paragraph of analysis.');
});

test('sources render into considerations (array or JSON string)', () => {
  const src = [{ title: 'ATO', url: 'https://ato.gov.au' }, { title: 'RBA', url: 'https://rba.gov.au' }];
  const b = researchBodyFromReport('Q', '## H\nbody', src);
  assert.ok(b.considerations.includes('[1] ATO — https://ato.gov.au'));
  assert.ok(b.considerations.includes('[2] RBA — https://rba.gov.au'));
  // JSON-string sources (TEXT column) are parsed too
  const b2 = researchBodyFromReport('Q', 'x', JSON.stringify(src));
  assert.ok(b2.considerations.includes('[1] ATO'));
});

test('empty / null report is safe', () => {
  const b = researchBodyFromReport('Q', '', []);
  assert.deepStrictEqual(b.sections, []);
  assert.strictEqual(b.considerations, '');
  assert.strictEqual(researchBodyFromReport('Q', null, null).title, 'Q');
});

test('always returns the six body keys the React view reads', () => {
  const b = researchBodyFromReport('Q', '## A\nb', []);
  for (const k of ['title', 'summary', 'sections', 'key_facts', 'risks', 'considerations']) {
    assert.ok(k in b, `missing ${k}`);
  }
  assert.deepStrictEqual(b.key_facts, []);
  assert.deepStrictEqual(b.risks, []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
