'use strict';
// Deterministic tests for lib/auth-tokens.js — reset-token hashing and the
// post-login redirect guard (open-redirect protection).

const assert = require('assert');
const crypto = require('crypto');
const t = require('../lib/auth-tokens');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('auth-tokens');

test('generated tokens are 64 hex chars and hash to SHA-256', () => {
  const { token, hash } = t.generateResetToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.strictEqual(hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.notStrictEqual(hash, token);
});

test('every token is different', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(t.generateResetToken().token);
  assert.strictEqual(seen.size, 200);
});

test('hash is deterministic for the same token', () => {
  const tok = 'a'.repeat(64);
  assert.strictEqual(t.hashResetToken(tok), t.hashResetToken(tok));
});

test('malformed tokens hash to null', () => {
  for (const bad of [undefined, null, '', 'abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), "' OR 1=1 --", ['a'.repeat(64)], 42]) {
    assert.strictEqual(t.hashResetToken(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('safe same-site paths are kept', () => {
  assert.strictEqual(t.safeRedirectPath('/app'), '/app');
  assert.strictEqual(t.safeRedirectPath('/app/goals?tab=open#x'), '/app/goals?tab=open#x');
  assert.strictEqual(t.safeRedirectPath('/onboarding/step/2'), '/onboarding/step/2');
});

test('off-site and malformed redirects fall back', () => {
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', 'javascript:alert(1)', '/app\\..\\x', '/a\nb', '/a\tb', '', null, undefined, 7, '/' + 'a'.repeat(600)]) {
    assert.strictEqual(t.safeRedirectPath(bad), '/app', `expected fallback for ${JSON.stringify(bad)}`);
  }
});

test('auth pages are never a redirect target', () => {
  for (const p of ['/login', '/login?next=/app', '/logout', '/signup', '/forgot-password', '/reset-password?token=x', '/verify-email']) {
    assert.strictEqual(t.safeRedirectPath(p), '/app', p);
  }
  assert.strictEqual(t.safeRedirectPath('/login-help'), '/login-help');
});

test('custom fallback is honoured', () => {
  assert.strictEqual(t.safeRedirectPath('//x', '/welcome'), '/welcome');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
