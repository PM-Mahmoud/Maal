'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ORIGIN_HEADER, createOriginLock, clientIP } = require('../lib/origin-lock');

const fixtureSecret = 'dummy-value-used-only-in-tests';

function run(lock, { path = '/app', method = 'GET', secret, cloudIP } = {}) {
  const req = {
    path, method, ip: '192.0.2.10',
    get(name) {
      if (name === ORIGIN_HEADER) return secret;
      if (name === 'CF-Connecting-IP') return cloudIP;
    },
  };
  const outcome = { passed: false };
  lock(req, {
    status(code) { outcome.status = code; return this; },
    json(body) { outcome.body = body; },
  }, () => { outcome.passed = true; });
  return { ...outcome, ip: clientIP(req) };
}

test('the disabled origin lock keeps the existing rate-limit address', () => {
  assert.deepEqual(run(createOriginLock(''), { cloudIP: '198.51.100.10' }), {
    passed: true, ip: '192.0.2.10',
  });
});

test('the enabled lock refuses a missing or different secret', () => {
  const lock = createOriginLock(fixtureSecret);
  for (const secret of [undefined, 'invalid']) {
    assert.deepEqual(run(lock, { secret, cloudIP: '198.51.100.10' }), {
      passed: false, ip: '192.0.2.10', status: 403, body: { error: 'Forbidden' },
    });
  }
});

test('only authorised traffic with a valid Cloudflare address changes the key', () => {
  const lock = createOriginLock(fixtureSecret);
  for (const cloudIP of ['198.51.100.10', '2001:db8::5']) {
    assert.deepEqual(run(lock, { secret: fixtureSecret, cloudIP }), {
      passed: true, ip: cloudIP,
    });
  }
  for (const cloudIP of [undefined, 'unknown']) {
    assert.deepEqual(run(lock, { secret: fixtureSecret, cloudIP }), {
      passed: true, ip: '192.0.2.10',
    });
  }
});

test('only exact read-only health checks bypass an enabled lock', () => {
  const lock = createOriginLock(fixtureSecret);
  for (const method of ['GET', 'HEAD']) {
    assert.deepEqual(run(lock, { path: '/health', method, cloudIP: '198.51.100.10' }), {
      passed: true, ip: '192.0.2.10',
    });
  }
  assert.equal(run(lock, { path: '/health', method: 'POST' }).status, 403);
  assert.equal(run(lock, { path: '/health/other' }).status, 403);
});
