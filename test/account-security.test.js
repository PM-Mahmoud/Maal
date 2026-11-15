'use strict';
// Deterministic tests for routes/account-security.js (Settings → Security, email 2FA):
// enabling requires a verified emailed code, disabling requires re-auth, wrong
// codes count towards the existing OTP lock, and every DB call uses the session
// user. No database, email or network: fake users db + loopback HTTP server.

const assert = require('assert');
const http = require('http');
const express = require('express');
const sec = require('../routes/account-security');

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

const noLimit = (_req, _res, next) => next();
const limiters = { otpLimiter: noLimit, authLimiter: noLimit };

function fakeUsers({ twoFactor = false, passwordHash = 'hash:pw', email = 'mahmoud@example.com' } = {}) {
  const state = { id: 7, email, two_factor_enabled: twoFactor, password_hash: passwordHash, otp: null, otpExp: 0, attempts: 0, lockedUntil: null, calls: [] };
  const log = (name, args) => state.calls.push({ name, args });
  return {
    state,
    findUserById: async (id) => { log('findUserById', [id]); return id === state.id ? { id: state.id, email: state.email, two_factor_enabled: state.two_factor_enabled } : null; },
    findUserByEmail: async (e) => { log('findUserByEmail', [e]); return e === state.email ? { id: state.id, email: state.email, password_hash: state.password_hash } : null; },
    setOtp: async (id, code, exp) => { log('setOtp', [id]); state.otp = code; state.otpExp = exp.getTime(); },
    findUserByOtp: async (e, code) => (e === state.email && code === state.otp && state.otpExp > Date.now() ? { id: state.id } : null),
    clearOtp: async (id) => { log('clearOtp', [id]); state.otp = null; },
    setTwoFactor: async (id, on) => { log('setTwoFactor', [id, on]); state.two_factor_enabled = !!on; },
    getOtpLockStatus: async (id) => { log('getOtpLockStatus', [id]); return { otp_attempts: state.attempts, otp_locked_until: state.lockedUntil }; },
    incrementOtpAttempts: async (id) => {
      log('incrementOtpAttempts', [id]);
      state.attempts += 1;
      if (state.attempts >= 5) state.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      return { otp_attempts: state.attempts, otp_locked_until: state.lockedUntil };
    },
    resetOtpAttempts: async (id) => { log('resetOtpAttempts', [id]); state.attempts = 0; state.lockedUntil = null; },
  };
}

async function withServer(router, userId, fn) {
  const app = express();
  app.use(express.json());
  const session = userId ? { userId, save: (cb) => cb() } : {};
  app.use((req, _res, next) => { req.session = session; next(); });
  app.use('/api', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/security/2fa`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  try { await fn({ base, post, session }); } finally { await new Promise((r) => server.close(r)); }
}

function build(users, extra = {}) {
  const sent = [];
  const router = sec.createAccountSecurityRouter({
    users, limiters,
    bcrypt: { compare: async (pw, hash) => hash === `hash:${pw}` },
    sendEmail: async (m) => { sent.push(m); },
    generateCode: () => '123456',
    ...extra,
  });
  return { router, sent };
}

// ─── Pure helpers ────────────────────────────────────────────────────────────
test('maskEmail hides most of the local part', () => {
  assert.strictEqual(sec.maskEmail('mahmoud@example.com'), 'ma•••••@example.com');
  assert.strictEqual(sec.maskEmail('ab@x.au'), 'a•@x.au');
  assert.strictEqual(sec.maskEmail('nope'), '');
});

test('normaliseCode accepts six digits with optional space/dash only', () => {
  assert.strictEqual(sec.normaliseCode('123456'), '123456');
  assert.strictEqual(sec.normaliseCode('123 456'), '123456');
  assert.strictEqual(sec.normaliseCode('123-456'), '123456');
  for (const bad of ['12345', '1234567', 'abcdef', '', null, undefined, {}, "1' OR '1"]) assert.strictEqual(sec.normaliseCode(bad), null, String(bad));
});

// ─── Router ──────────────────────────────────────────────────────────────────
test('401 without a session on every endpoint', async () => {
  const { router } = build(fakeUsers());
  await withServer(router, null, async ({ base, post }) => {
    assert.strictEqual((await fetch(base)).status, 401);
    for (const p of ['/start', '/confirm', '/disable']) assert.strictEqual((await post(p, {})).status, 401, p);
  });
});

test('status reports email method, masked address, password presence — never the raw email', async () => {
  const { router } = build(fakeUsers());
  await withServer(router, 7, async ({ base }) => {
    const j = await (await fetch(base)).json();
    assert.deepStrictEqual({ enabled: j.enabled, method: j.method, hasPassword: j.hasPassword }, { enabled: false, method: 'email', hasPassword: true });
    assert.ok(!JSON.stringify(j).includes('mahmoud@'));
  });
});

test('enable: code emailed, wrong code rejected, right code turns 2FA on for the session user', async () => {
  const users = fakeUsers();
  const { router, sent } = build(users);
  await withServer(router, 7, async ({ post }) => {
    // Confirm before start → no pending request.
    assert.strictEqual((await post('/confirm', { code: '123456' })).status, 400);
    const s = await post('/start', { purpose: 'enable' });
    assert.strictEqual(s.status, 200);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'mahmoud@example.com');
    assert.ok(sent[0].text.includes('123456'));
    const wrong = await post('/confirm', { code: '000000' });
    assert.strictEqual(wrong.status, 400);
    assert.strictEqual((await wrong.json()).code, 'wrong_code');
    assert.strictEqual(users.state.two_factor_enabled, false);
    const ok = await post('/confirm', { code: '123 456' });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(users.state.two_factor_enabled, true);
    assert.strictEqual(users.state.otp, null, 'code is single-use');
    assert.strictEqual(users.state.attempts, 0);
    // Replay of the same code fails (pending request cleared).
    assert.strictEqual((await post('/confirm', { code: '123456' })).status, 400);
  });
  assert.ok(users.state.calls.every((c) => c.name === 'findUserByEmail' || c.args[0] === 7), 'every id-keyed call uses the session user');
});

test('five wrong codes lock verification (429), even with the right code afterwards', async () => {
  const users = fakeUsers();
  const { router } = build(users);
  await withServer(router, 7, async ({ post }) => {
    await post('/start', { purpose: 'enable' });
    let last;
    for (let i = 0; i < 5; i++) last = await post('/confirm', { code: '999999' });
    assert.strictEqual(last.status, 429);
    assert.strictEqual((await post('/confirm', { code: '123456' })).status, 429);
    assert.strictEqual(users.state.two_factor_enabled, false);
    assert.strictEqual((await post('/start', { purpose: 'enable' })).status, 429);
  });
});

test('expired request is rejected', async () => {
  const users = fakeUsers();
  let t = Date.now();
  const { router } = build(users, { now: () => t });
  await withServer(router, 7, async ({ post }) => {
    await post('/start', { purpose: 'enable' });
    t += sec.CODE_TTL_MS + 1000;
    const r = await post('/confirm', { code: '123456' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual((await r.json()).code, 'expired');
    assert.strictEqual(users.state.two_factor_enabled, false);
  });
});

test('disable needs the password for password accounts; wrong password counts towards the lock', async () => {
  const users = fakeUsers({ twoFactor: true });
  const { router } = build(users);
  await withServer(router, 7, async ({ post }) => {
    const viaCode = await post('/start', { purpose: 'disable' });
    assert.strictEqual(viaCode.status, 400);
    assert.strictEqual((await viaCode.json()).code, 'password_required');
    const wrong = await post('/disable', { password: 'nope' });
    assert.strictEqual(wrong.status, 400);
    assert.strictEqual(users.state.attempts, 1);
    assert.strictEqual(users.state.two_factor_enabled, true);
    const ok = await post('/disable', { password: 'pw' });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(users.state.two_factor_enabled, false);
  });
});

test('password-less (Google) accounts disable with an emailed code instead', async () => {
  const users = fakeUsers({ twoFactor: true, passwordHash: null });
  const { router } = build(users);
  await withServer(router, 7, async ({ post }) => {
    assert.strictEqual((await post('/disable', { password: 'x' })).status, 400);
    assert.strictEqual((await post('/start', { purpose: 'disable' })).status, 200);
    assert.strictEqual((await post('/confirm', { code: '123456' })).status, 200);
    assert.strictEqual(users.state.two_factor_enabled, false);
  });
});

test('start rejects unknown purposes and no-op transitions', async () => {
  const { router } = build(fakeUsers({ twoFactor: true }));
  await withServer(router, 7, async ({ post }) => {
    assert.strictEqual((await post('/start', { purpose: 'toggle' })).status, 400);
    assert.strictEqual((await post('/start', { purpose: 'enable' })).status, 409);
  });
});

(async () => {
  console.log('\naccount security (2FA)');
  for (const { name, fn } of queue) {
    try { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
