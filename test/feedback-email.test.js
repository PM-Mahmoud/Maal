'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const { test } = require('node:test');
const { sendTeamNotification } = require('../services/email');

const feedback = { kind: 'feedback', message: 'Synthetic feedback', from: 'Fixture sender' };

test('missing and blank feedback recipients skip transport and warn once', async (t) => {
  const oldInbox = process.env.FEEDBACK_EMAIL;
  t.after(() => {
    if (oldInbox === undefined) delete process.env.FEEDBACK_EMAIL;
    else process.env.FEEDBACK_EMAIL = oldInbox;
  });
  const warn = t.mock.method(console, 'warn', () => {});
  const request = t.mock.method(https, 'request', () => { throw new Error('Unexpected transport'); });

  delete process.env.FEEDBACK_EMAIL;
  await sendTeamNotification(feedback);
  process.env.FEEDBACK_EMAIL = '  ';
  await sendTeamNotification(feedback);

  assert.equal(request.mock.callCount(), 0);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /FEEDBACK_EMAIL.*skipped/);
  assert.doesNotMatch(warn.mock.calls[0].arguments[0], /@/);
});

test('configured feedback recipient is the sole email destination', async (t) => {
  const overrides = {
    FEEDBACK_EMAIL: ' feedback@example.invalid ',
    EMAIL_FROM: 'mailer@example.invalid',
    RESEND_API_KEY: 'fixture-api-key',
  };
  for (const [key, value] of Object.entries(overrides)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    });
  }

  let payload;
  const request = t.mock.method(https, 'request', (_options, callback) => ({
    on() {},
    setTimeout() {},
    write(body) { payload = JSON.parse(body); },
    end() {
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      response.emit('data', '{"id":"fixture"}');
      response.emit('end');
    },
  }));

  await sendTeamNotification(feedback);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(payload.to, 'feedback@example.invalid');
});
