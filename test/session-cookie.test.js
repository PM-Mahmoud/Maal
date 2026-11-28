'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const modulePath = require.resolve('../lib/session-cookie');

test('production and local cookies use matching issue and logout attributes', (t) => {
  const initialEnv = process.env.NODE_ENV;
  t.after(() => {
    if (initialEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = initialEnv;
    delete require.cache[modulePath];
  });

  for (const [env, expectedName, secure] of [
    ['production', '__Host-maal.sid', true],
    ['development', 'connect.sid', false],
  ]) {
    process.env.NODE_ENV = env;
    delete require.cache[modulePath];
    const { name, options, clearSessionCookie } = require(modulePath);

    assert.equal(name, expectedName);
    assert.deepEqual(options, { path: '/', httpOnly: true, sameSite: 'lax', secure });
    const res = { clearCookie: t.mock.fn() };
    clearSessionCookie(res);
    assert.deepEqual(res.clearCookie.mock.calls[0].arguments, [name, options]);
  }
});
