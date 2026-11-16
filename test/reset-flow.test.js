'use strict';
// Deterministic tests for the reset-password flow (routes/reset.js) with the
// DB stubbed in memory: hashed tokens, expiry, single use, password rules,
// confirm-match, and revoking the user's other sessions after a reset.

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');

// ── In-memory stand-ins for db/users.js and db/sessions.js ──────────────────
const db = { users: [], sessions: [] };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => Date.now();

const usersStub = {
  async findUserByResetToken(hash) {
    if (!hash) return null;
    const u = db.users.find((x) => x.reset_token === hash && x.reset_token_exp > now());
    return u ? { id: u.id, email: u.email } : null;
  },
  async consumeResetToken(hash, passwordHash) {
    if (!hash) return null;
    const u = db.users.find((x) => x.reset_token === hash && x.reset_token_exp > now());
    if (!u) return null;
    Object.assign(u, { password_hash: passwordHash, reset_token: null, reset_token_exp: null, failed_attempts: 0, locked_until: null });
    return { id: u.id, email: u.email };
  },
};
const sessionsStub = {
  async destroyUserSessions(userId, keepSid) {
    const before = db.sessions.length;
    db.sessions = db.sessions.filter((s) => !(String(s.userId) === String(userId) && s.sid !== keepSid));
    return before - db.sessions.length;
  },
};
function stub(rel, exports) {
  const file = require.resolve(path.join(__dirname, '..', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stub('db/users.js', usersStub);
stub('db/sessions.js', sessionsStub);

const { showResetPage, submitReset, INVALID_LINK } = require('../routes/reset')._handlers;

function fakeRes() {
  const res = { headers: {}, view: null, locals: null, redirected: null };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.render = (view, locals) => { res.view = view; res.locals = locals; return res; };
  res.redirect = (to) => { res.redirected = to; return res; };
  return res;
}
const TOKEN = 'b'.repeat(64);
function seed({ expiresIn = 3600e3 } = {}) {
  db.users = [{ id: 7, email: 'mahmoud@example.com', password_hash: 'old', reset_token: sha(TOKEN), reset_token_exp: now() + expiresIn, failed_attempts: 4, locked_until: now() + 1e6 }];
  db.sessions = [
    { sid: 'phone', userId: 7 }, { sid: 'laptop', userId: 7 }, { sid: 'someone-else', userId: 8 },
  ];
}
const GOOD = 'Kangaroo#2026';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}

(async () => {
  console.log('reset-password flow');

  await test('no token in the URL sends you to Forgot password', async () => {
    const res = fakeRes();
    await showResetPage({ query: {} }, res);
    assert.strictEqual(res.redirected, '/forgot-password');
  });

  await test('a valid link shows the Create password step, no-store + no-referrer', async () => {
    seed();
    const res = fakeRes();
    await showResetPage({ query: { token: TOKEN } }, res);
    assert.strictEqual(res.view, 'auth-reset-password');
    assert.strictEqual(res.locals.token, TOKEN);
    assert.strictEqual(res.locals.step, 'create');
    assert.strictEqual(res.locals.error, null);
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
    assert.strictEqual(res.headers['Referrer-Policy'], 'no-referrer');
  });

  await test('the raw token is never what the DB matches on (only its hash)', async () => {
    seed();
    db.users[0].reset_token = TOKEN; // pretend a legacy row stored it raw
    const res = fakeRes();
    await showResetPage({ query: { token: TOKEN } }, res);
    assert.strictEqual(res.locals.token, '');
    assert.strictEqual(res.locals.error, INVALID_LINK);
  });

  await test('an expired link is rejected', async () => {
    seed({ expiresIn: -1000 });
    const res = fakeRes();
    await showResetPage({ query: { token: TOKEN } }, res);
    assert.strictEqual(res.locals.error, INVALID_LINK);
    const res2 = fakeRes();
    await submitReset({ body: { token: TOKEN, password: GOOD, confirm: GOOD }, session: {} }, res2);
    assert.strictEqual(res2.locals.error, INVALID_LINK);
    assert.strictEqual(db.users[0].password_hash, 'old');
  });

  await test('malformed tokens are rejected without touching the DB', async () => {
    seed();
    for (const token of ['', 'abc', "' OR 1=1 --", 'B'.repeat(64)]) {
      const res = fakeRes();
      await submitReset({ body: { token, password: GOOD, confirm: GOOD }, session: {} }, res);
      assert.strictEqual(res.locals.error, INVALID_LINK, token);
    }
    assert.strictEqual(db.users[0].password_hash, 'old');
  });

  await test('weak passwords are refused with the server rule message, link kept', async () => {
    seed();
    const res = fakeRes();
    await submitReset({ body: { token: TOKEN, password: 'kangaroo#2026', confirm: 'kangaroo#2026' }, session: {} }, res);
    assert.match(res.locals.error, /uppercase/);
    assert.strictEqual(res.locals.step, 'create');
    assert.strictEqual(res.locals.token, TOKEN);
    assert.strictEqual(db.users[0].password_hash, 'old');
  });

  await test('a mismatched confirmation is refused and keeps the link usable', async () => {
    seed();
    const res = fakeRes();
    await submitReset({ body: { token: TOKEN, password: GOOD, confirm: GOOD + 'x' }, session: {} }, res);
    assert.match(res.locals.error, /don't match/);
    assert.strictEqual(res.locals.token, TOKEN);
    assert.strictEqual(db.users[0].password_hash, 'old');
  });

  await test('success sets a bcrypt hash, clears lockout, and revokes the user’s sessions', async () => {
    seed();
    const res = fakeRes();
    await submitReset({ body: { token: TOKEN, password: GOOD, confirm: GOOD }, session: {}, sessionID: 'anon' }, res);
    assert.strictEqual(res.locals.success, true);
    const u = db.users[0];
    assert.match(u.password_hash, /^\$2[aby]\$12\$/);
    assert.strictEqual(u.reset_token, null);
    assert.strictEqual(u.failed_attempts, 0);
    assert.strictEqual(u.locked_until, null);
    assert.deepStrictEqual(db.sessions.map((s) => s.sid), ['someone-else']);
  });

  await test('a link works only once', async () => {
    seed();
    await submitReset({ body: { token: TOKEN, password: GOOD, confirm: GOOD }, session: {} }, fakeRes());
    const firstHash = db.users[0].password_hash;
    const res = fakeRes();
    await submitReset({ body: { token: TOKEN, password: 'Wombat!2027', confirm: 'Wombat!2027' }, session: {} }, res);
    assert.strictEqual(res.locals.error, INVALID_LINK);
    assert.strictEqual(db.users[0].password_hash, firstHash);
  });

  await test('the browser doing the reset keeps its own session if it is the same user', async () => {
    seed();
    await submitReset({ body: { token: TOKEN, password: GOOD, confirm: GOOD }, session: { userId: 7 }, sessionID: 'laptop' }, fakeRes());
    assert.deepStrictEqual(db.sessions.map((s) => s.sid).sort(), ['laptop', 'someone-else']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
