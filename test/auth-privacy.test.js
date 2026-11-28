'use strict';

const assert = require('node:assert/strict');
const { setImmediate: flush } = require('node:timers/promises');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const users = require('../db/users');
const accountUnlock = require('../db/account-unlock');
const waitlist = require('../services/waitlist-access');
const referrals = require('../services/referrals');
const mail = require('../services/email');
const { hashResetToken } = require('../lib/auth-tokens');

const verifiedMember = {
  id: 7,
  email: 'member@example.invalid',
  password_hash: 'member-password-hash-fixture',
  email_verified: true,
};

let member = verifiedMember;
let lockCreated = false;
const issued = [];
const delivered = [];
const checkpoints = [];

users.findUserByEmail = async (email) => email === verifiedMember.email ? member : null;
users.createUser = async ({ email }) => ({ id: 8, name: 'Fixture member', email, email_verified: false });
users.setResetToken = async (userId, hash, expiresAt) => checkpoints.push({ userId, hash, expiresAt });
users.setOtp = async () => {};
waitlist.canSignUp = async () => true;
waitlist.recordJoined = async () => {};
referrals.onSignup = async () => {};
bcrypt.compare = async () => false;
mail.sendEmail = async (message) => { delivered.push(message); };

accountUnlock.recordPasswordFailure = async (userId, passwordHash, options) => {
  issued.push({ userId, passwordHash, ...options });
  return lockCreated;
};

const unlocks = new Map();
accountUnlock.consumeAccountUnlock = async (hash) => {
  const expiry = unlocks.get(hash);
  if (!expiry || expiry <= Date.now()) return false;
  unlocks.delete(hash);
  return true;
};

const api = require('../routes/api');
const auth = require('../routes/auth');
const { showUnlockPage, submitUnlock } = require('../routes/reset')._handlers;

function post(router, path) {
  return router.stack.find(({ route }) => route?.path === path && route.methods.post).route.stack.at(-1).handle;
}

async function call(handler, request) {
  const result = { status: 200, headers: {} };
  const req = { query: {}, session: { save(callback) { callback(); } }, ...request };
  await handler(req, {
    status(code) { result.status = code; return this; },
    set(key, value) { result.headers[key] = value; return this; },
    json(body) { result.body = body; },
    render(view, locals) { result.view = view; result.locals = locals; },
    redirect(location) { result.location = location; },
  });
  return result;
}

test('JSON and form password failures use the same wording for every account state', async () => {
  const error = 'Email or password is incorrect';
  for (const [email, current] of [
    ['unknown@example.invalid', verifiedMember],
    [verifiedMember.email, verifiedMember],
    [verifiedMember.email, { ...verifiedMember, password_hash: null }],
    [verifiedMember.email, { ...verifiedMember, locked_until: new Date(Date.now() + 60_000) }],
  ]) {
    member = current;
    const request = { body: { email, password: 'incorrect-fixture' } };
    const login = await call(post(api, '/auth/login'), request);
    const form = await call(post(auth, '/login'), request);
    assert.equal(login.status, 401);
    assert.deepEqual(login.body, { error });
    assert.equal(form.view, 'auth-login');
    assert.equal(form.locals.error, error);
  }
  member = verifiedMember;
});

test('the lock transition issues one emailed token and stores only its hash', async () => {
  lockCreated = true;
  await call(post(api, '/auth/login'), { body: { email: verifiedMember.email, password: 'incorrect-fixture' } });
  lockCreated = false;
  await flush();
  const { userId, maxAttempts, tokenHash, expiresAt } = issued.at(-1);
  assert.equal(userId, verifiedMember.id);
  assert.equal(maxAttempts, 5);
  assert.ok(expiresAt > Date.now());
  const unlockEmail = delivered.find(({ subject }) => subject === 'Unlock your Maal account');
  const raw = new URL(unlockEmail.text.match(/https?:\/\/\S+\/unlock-account\?token=[0-9a-f]+/)[0]).searchParams.get('token');
  assert.equal(hashResetToken(raw), tokenHash);
  assert.notEqual(raw, tokenHash);
});

test('signup and forgot-password responses are equivalent for new and existing addresses', async () => {
  const [signup, forgot] = [post(api, '/auth/signup'), post(auth, '/forgot-password')];
  async function responses(email) {
    const req = { body: { email, password: 'Fixture-pass-8!' } };
    return [await call(signup, req), await call(forgot, req)];
  }
  assert.deepEqual(await responses(verifiedMember.email), await responses('unknown@example.invalid'));
  await flush();
  assert.equal(checkpoints.length, 1);
});

test('the unlock link is no-store, confirmed by POST, single-use and expiring', async () => {
  const raw = 'a'.repeat(64);
  const expired = 'b'.repeat(64);
  unlocks.set(hashResetToken(raw), Date.now() + 60_000);
  unlocks.set(hashResetToken(expired), Date.now() - 1);

  const check = await call(showUnlockPage, { query: { token: raw } });
  assert.equal(check.locals.token, raw);
  assert.deepEqual(check.headers, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });

  const used = await call(submitUnlock, { body: { token: raw } });
  assert.equal(used.locals.success, true);
  const replay = await call(submitUnlock, { body: { token: raw } });
  const stale = await call(submitUnlock, { body: { token: expired } });
  assert.equal(replay.locals.success, false);
  assert.equal(stale.locals.error, replay.locals.error);
});
