'use strict';
// Deterministic tests for lib/db-errors.js — the unknown-column → 400 mapping
// used by POST /api/v1/:table in routes/api.js.

const assert = require('assert');
const { unknownColumnMessage } = require('../lib/db-errors');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('db-errors');

test('undefined_column names the field and table', () => {
  const err = { code: '42703', message: 'column "nope" of relation "assets" does not exist' };
  assert.strictEqual(unknownColumnMessage(err, 'assets'), 'Unknown field "nope" on assets');
});

test('undefined_column without a parsable name still maps', () => {
  assert.strictEqual(unknownColumnMessage({ code: '42703', message: 'weird' }, 'goals'), 'Unknown field on goals');
});

test('other errors are not client errors', () => {
  assert.strictEqual(unknownColumnMessage({ code: '23505', message: 'duplicate key' }, 'assets'), null);
  assert.strictEqual(unknownColumnMessage(new Error('connection reset'), 'assets'), null);
  assert.strictEqual(unknownColumnMessage(null, 'assets'), null);
});

test('never echoes unsafe text from the error', () => {
  const err = { code: '42703', message: 'column "a;drop" of relation "x" does not exist' };
  assert.strictEqual(unknownColumnMessage(err, 'bad table'), 'Unknown field');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
