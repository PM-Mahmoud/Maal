'use strict';
// test/storage.test.js
// Deterministic tests for services/storage.js — the pure config/key logic behind
// the Vault object-storage adapter. No network or AWS SDK calls: isConfigured()
// and keyFor() are pure, and the SDK is required lazily so it never loads here.

const assert = require('assert');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

// Snapshot + restore env so tests don't leak configuration into each other.
const STORAGE_VARS = ['STORAGE_ENDPOINT', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY', 'STORAGE_REGION'];
const saved = {};
for (const k of STORAGE_VARS) saved[k] = process.env[k];
function clearStorageEnv() { for (const k of STORAGE_VARS) delete process.env[k]; }
function setFullConfig() {
  process.env.STORAGE_ENDPOINT = 'https://acct.r2.cloudflarestorage.com';
  process.env.STORAGE_BUCKET = 'maal-vault';
  process.env.STORAGE_ACCESS_KEY_ID = 'AKIA_test';
  process.env.STORAGE_SECRET_ACCESS_KEY = 'secret_test';
}

const storage = require('../services/storage');

console.log('\nisConfigured');

test('false when nothing is set (Vault falls back to bytea)', () => {
  clearStorageEnv();
  assert.strictEqual(storage.isConfigured(), false);
});

test('false when any single credential is missing', () => {
  for (const missing of ['STORAGE_ENDPOINT', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY']) {
    clearStorageEnv();
    setFullConfig();
    delete process.env[missing];
    assert.strictEqual(storage.isConfigured(), false, `should be false without ${missing}`);
  }
});

test('true only when all four credentials are present (region optional)', () => {
  clearStorageEnv();
  setFullConfig();
  assert.strictEqual(storage.isConfigured(), true);
});

test('blank/whitespace-only values do not count as configured', () => {
  clearStorageEnv();
  setFullConfig();
  process.env.STORAGE_BUCKET = '   ';
  assert.strictEqual(storage.isConfigured(), false);
});

console.log('\nkeyFor');

test('namespaces the key by user and preserves a sanitised filename', () => {
  const key = storage.keyFor(42, 'June statement.pdf');
  assert.ok(key.startsWith('vault/42/'), 'starts with vault/<userId>/');
  assert.ok(key.endsWith('-June_statement.pdf'), 'ends with sanitised filename');
});

test('strips path separators and unsafe characters from the filename', () => {
  const key = storage.keyFor(7, '../../etc/passwd');
  assert.ok(!key.includes('..'), 'no traversal sequences');
  assert.ok(key.startsWith('vault/7/'), 'still namespaced by user');
});

test('two uploads of the same name get distinct (random) keys', () => {
  const a = storage.keyFor(1, 'doc.pdf');
  const b = storage.keyFor(1, 'doc.pdf');
  assert.notStrictEqual(a, b, 'random component prevents collisions');
});

test('a missing filename still produces a valid key', () => {
  const key = storage.keyFor(9, undefined);
  assert.ok(/^vault\/9\/.+-document$/.test(key));
});

// Restore original env.
clearStorageEnv();
for (const k of STORAGE_VARS) if (saved[k] !== undefined) process.env[k] = saved[k];

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
