'use strict';
// Deterministic tests for lib/password-rules.js — the new-account password
// rules the server enforces on POST /signup and the sign-up page mirrors.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pr = require('../lib/password-rules');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('password-rules');

test('a strong password passes every rule', () => {
  assert.strictEqual(pr.passwordStrengthError('Kangaroo#2026'), null);
  assert.deepStrictEqual(pr.checkPassword('Kangaroo#2026'), { upper: true, lower: true, num: true, len: true, special: true });
});

test('length is reported first', () => {
  assert.match(pr.passwordStrengthError('Ab1!'), /8 to 64/);
  assert.match(pr.passwordStrengthError(''), /8 to 64/);
});

test('over 64 characters fails', () => {
  const long = 'Aa1!' + 'x'.repeat(61); // 65
  assert.strictEqual(long.length, 65);
  assert.match(pr.passwordStrengthError(long), /8 to 64/);
  assert.strictEqual(pr.passwordStrengthError(long.slice(0, 64)), null);
});

test('each missing class is named', () => {
  assert.match(pr.passwordStrengthError('kangaroo#2026'), /uppercase/);
  assert.match(pr.passwordStrengthError('KANGAROO#2026'), /lowercase/);
  assert.match(pr.passwordStrengthError('Kangaroo#roo'), /number/);
  assert.match(pr.passwordStrengthError('Kangaroo2026'), /special/);
});

test('non-strings are treated as empty, never throw', () => {
  assert.match(pr.passwordStrengthError(undefined), /8 to 64/);
  assert.strictEqual(pr.checkPassword(null).len, false);
});

test('sign-up page checklist mirrors every server rule', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'auth-signup.ejs'), 'utf8');
  for (const r of pr.RULES) assert.ok(view.includes(`data-rule="${r.id}"`), `auth-signup.ejs missing rule ${r.id}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
