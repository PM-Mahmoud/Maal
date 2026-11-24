'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { inspect } = require('node:util');
const { safeError } = require('../lib/safe-log');

test('retains operational metadata and excludes private error content', () => {
  const error = Object.assign(new TypeError('account for demo@example.test'), {
    code: '23505',
    statusCode: 409,
    stack: 'request token synthetic-credential',
    detail: 'payment amount $123.45',
    config: { headers: { authorization: 'Bearer synthetic-credential' } },
    cause: new Error('transaction description'),
  });
  const safe = safeError(error);
  assert.deepEqual(safe, { name: 'TypeError', code: '23505', status: 409 });
  assert.doesNotMatch(inspect(safe), /demo@example|synthetic|123\.45|transaction description/);
});

test('drops unknown and malformed metadata without coercing it', () => {
  assert.deepEqual(safeError({
    name: 'private.example.test',
    code: 'customer-secret',
    status: '401',
    statusCode: 700,
  }), { name: 'Error' });
  for (const value of [null, undefined, 'private payload', 123, { status: 200 }, { status: 403.5 }]) {
    assert.deepEqual(safeError(value), { name: 'Error' });
  }
});

test('handles property getters without reading error messages', () => {
  const error = {
    get code() { throw new Error('secret'); },
    get message() { assert.fail('message should never be read'); },
  };
  assert.deepEqual(safeError(error), { name: 'Error' });
  assert.deepEqual(safeError({ name: 'AbortError', code: 'ABORT_ERR', status: 408 }), {
    name: 'AbortError', code: 'ABORT_ERR', status: 408,
  });
});
