'use strict';
// Deterministic tests for the Settings → Risk profile assessment:
//  1. lib/risk-profile.js scoring (bands, guard-rail caps, validation)
//  2. db/risk-profile.js — every statement is user-scoped (IDOR guard)
//  3. routes/risk-profile.js — auth, server-side re-scoring, partial answers rejected
// No database or network.

const assert = require('assert');
const http = require('http');
const express = require('express');
const rp = require('../lib/risk-profile');

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

const LOWEST = { goal: 'protect', age_band: '60+', income_stability: 'none', horizon: 'lt3', drawdown: 'sell_all', range: 'narrow', experience: 'none' };
const HIGHEST = { goal: 'maximise', age_band: 'under-30', income_stability: 'very_stable', horizon: '10plus', drawdown: 'buy_more', range: 'widest', experience: 'experienced' };

// ─── 1. Scoring ──────────────────────────────────────────────────────────────
test('seven scored questions, max 21 points, six screens (about-you groups two)', () => {
  assert.strictEqual(rp.QUESTIONS.length, 7);
  assert.strictEqual(rp.MAX_POINTS, 21);
  assert.strictEqual(rp.STEPS.length, 6);
  assert.deepStrictEqual(rp.STEPS.find((s) => s.id === 'about').questions, ['age_band', 'income_stability']);
});

test('bands map onto the portfolio engine values', () => {
  assert.deepStrictEqual(rp.PROFILES, ['conservative', 'balanced', 'growth', 'high-growth']);
  assert.strictEqual(rp.bandFor(0), 'conservative');
  assert.strictEqual(rp.bandFor(34), 'conservative');
  assert.strictEqual(rp.bandFor(35), 'balanced');
  assert.strictEqual(rp.bandFor(54), 'balanced');
  assert.strictEqual(rp.bandFor(55), 'growth');
  assert.strictEqual(rp.bandFor(74), 'growth');
  assert.strictEqual(rp.bandFor(75), 'high-growth');
  assert.strictEqual(rp.bandFor(100), 'high-growth');
});

test('all-lowest answers → Conservative, 0 points', () => {
  const r = rp.scoreRiskProfile(LOWEST);
  assert.strictEqual(r.profile, 'conservative');
  assert.strictEqual(r.points, 0);
  assert.strictEqual(r.pct, 0);
});

test('all-highest answers → High Growth, 21/21', () => {
  const r = rp.scoreRiskProfile(HIGHEST);
  assert.strictEqual(r.profile, 'high-growth');
  assert.strictEqual(r.points, 21);
  assert.strictEqual(r.pct, 100);
  assert.deepStrictEqual(r.caps, []);
});

test('mid answers land in Balanced and Growth deterministically', () => {
  // 1+1+1+2+2+1+1 = 9/21 = 43% → balanced
  const bal = rp.scoreRiskProfile({ goal: 'income', age_band: '50-59', income_stability: 'variable', horizon: '5to10', drawdown: 'hold', range: 'moderate', experience: 'defensive' });
  assert.strictEqual(bal.points, 9);
  assert.strictEqual(bal.pct, 43);
  assert.strictEqual(bal.profile, 'balanced');
  // 2+2+2+3+2+2+2 = 15/21 = 71% → growth
  const gr = rp.scoreRiskProfile({ goal: 'grow', age_band: '40-49', income_stability: 'stable', horizon: '10plus', drawdown: 'hold', range: 'wide', experience: 'shares' });
  assert.strictEqual(gr.points, 15);
  assert.strictEqual(gr.pct, 71);
  assert.strictEqual(gr.profile, 'growth');
});

test('short horizon caps the band: <3 years → Conservative, 3–5 years → Balanced', () => {
  const lt3 = rp.scoreRiskProfile({ ...HIGHEST, horizon: 'lt3' });
  assert.strictEqual(lt3.pct, 86); // would be high-growth on points alone
  assert.strictEqual(lt3.profile, 'conservative');
  assert.deepStrictEqual(lt3.caps, ['horizon']);
  const mid = rp.scoreRiskProfile({ ...HIGHEST, horizon: '3to5' });
  assert.strictEqual(mid.profile, 'balanced');
  assert.deepStrictEqual(mid.caps, ['horizon']);
});

test('selling everything after a 20% fall caps at Balanced', () => {
  const r = rp.scoreRiskProfile({ ...HIGHEST, drawdown: 'sell_all' });
  assert.strictEqual(r.profile, 'balanced');
  assert.deepStrictEqual(r.caps, ['drawdown']);
  // A cap never raises a band.
  assert.strictEqual(rp.scoreRiskProfile(LOWEST).caps.length, 0);
});

test('partial or invalid answers score to null; unknown keys are dropped', () => {
  assert.strictEqual(rp.scoreRiskProfile({}), null);
  assert.strictEqual(rp.scoreRiskProfile(null), null);
  assert.strictEqual(rp.scoreRiskProfile({ ...HIGHEST, goal: 'yolo' }), null);
  assert.strictEqual(rp.scoreRiskProfile([1, 2]), null);
  const { answers, missing } = rp.validateAnswers({ ...HIGHEST, horizon: undefined, extra: 'x' });
  assert.deepStrictEqual(missing, ['horizon']);
  assert.ok(!('extra' in answers));
});

test('buildRecord stamps date + version; toClient adds labels and education copy', () => {
  const rec = rp.buildRecord(LOWEST, new Date('2026-11-16T01:02:03Z'));
  assert.strictEqual(rec.completed_at, '2026-11-16T01:02:03.000Z');
  assert.strictEqual(rec.version, 1);
  assert.deepStrictEqual(rec.answers, LOWEST);
  const c = rp.toClient(rec);
  assert.strictEqual(c.label, 'Conservative');
  assert.strictEqual(c.summary, 'Lowest risk, lowest potential return');
  assert.strictEqual(rp.toClient({ profile: 'reckless' }), null);
  assert.strictEqual(rp.toClient(null), null);
});

test('public questions never expose points', () => {
  const pub = rp.publicQuestions();
  assert.ok(!JSON.stringify(pub).includes('"points"'));
  assert.strictEqual(pub.questions.length, 7);
  assert.strictEqual(pub.profiles.length, 4);
});

// ─── 2. DB scoping ───────────────────────────────────────────────────────────
test('db: get + save filter by / key on user_id and merge into onboarding_data', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ risk_profile: { profile: 'growth' }, age_band: '30-39' }] }; } };
  const db = require('../db/risk-profile').createRiskProfileDb(pool);
  const got = await db.getRiskProfile(42);
  assert.deepStrictEqual(got, { riskProfile: { profile: 'growth' }, ageBand: '30-39' });
  assert.ok(/WHERE user_id = \$1/.test(calls[0].sql));
  assert.deepStrictEqual(calls[0].params, [42]);
  await db.saveRiskProfile(42, { profile: 'growth' });
  await db.saveRiskProfile(42, { profile: 'high-growth' });
  assert.deepStrictEqual(JSON.parse(calls[2].params[1]), { risk_profile: { profile: 'high-growth' }, risk: 'high-growth', risk_tolerance: 'high_growth' });
  assert.ok(/ON CONFLICT \(user_id\)/.test(calls[1].sql));
  assert.ok(/onboarding_data, '\{\}'::jsonb\) \|\| \$2::jsonb/.test(calls[1].sql));
  assert.strictEqual(calls[1].params[0], 42);
  assert.deepStrictEqual(JSON.parse(calls[1].params[1]), { risk_profile: { profile: 'growth' }, risk: 'growth', risk_tolerance: 'growth' });
});

// ─── 3. Router ───────────────────────────────────────────────────────────────
async function withServer(router, userId, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  app.use('/api', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

test('router: 401 without a session', async () => {
  const { createRiskProfileRouter } = require('../routes/risk-profile');
  const router = createRiskProfileRouter({ db: { getRiskProfile: async () => ({}), saveRiskProfile: async () => null } });
  await withServer(router, null, async (base) => {
    assert.strictEqual((await fetch(`${base}/v1/risk-profile`)).status, 401);
    assert.strictEqual((await fetch(`${base}/v1/risk-profile`, { method: 'POST' })).status, 401);
  });
});

test('router: saves the server-scored record for the SESSION user, ignoring a client-sent profile', async () => {
  const saved = [];
  const { createRiskProfileRouter } = require('../routes/risk-profile');
  const router = createRiskProfileRouter({
    now: () => new Date('2026-11-16T00:00:00Z'),
    db: { getRiskProfile: async () => ({}), saveRiskProfile: async (uid, rec) => { saved.push({ uid, rec }); return rec; } },
  });
  await withServer(router, 7, async (base) => {
    const r = await fetch(`${base}/v1/risk-profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: LOWEST, profile: 'high-growth', userId: 99 }),
    });
    assert.strictEqual(r.status, 200);
    const j = await r.json();
    assert.strictEqual(j.result.profile, 'conservative');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].uid, 7);
    assert.strictEqual(saved[0].rec.completed_at, '2026-11-16T00:00:00.000Z');
  });
});

test('router: partial answers → 400 with the missing ids, nothing saved', async () => {
  let saves = 0;
  const { createRiskProfileRouter } = require('../routes/risk-profile');
  const router = createRiskProfileRouter({ db: { getRiskProfile: async () => ({}), saveRiskProfile: async () => { saves++; } } });
  await withServer(router, 7, async (base) => {
    const r = await fetch(`${base}/v1/risk-profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { goal: 'grow' } }),
    });
    assert.strictEqual(r.status, 400);
    const j = await r.json();
    assert.ok(j.missing.includes('horizon'));
    assert.strictEqual(saves, 0);
  });
});

test('router: GET returns questions + normalised stored result', async () => {
  const { createRiskProfileRouter } = require('../routes/risk-profile');
  const rec = rp.buildRecord(HIGHEST, new Date('2026-11-01T00:00:00Z'));
  const router = createRiskProfileRouter({ db: { getRiskProfile: async (uid) => { assert.strictEqual(uid, 3); return { riskProfile: rec, ageBand: 'under-30' }; } } });
  await withServer(router, 3, async (base) => {
    const j = await (await fetch(`${base}/v1/risk-profile`)).json();
    assert.strictEqual(j.result.label, 'High Growth');
    assert.strictEqual(j.ageBand, 'under-30');
    assert.strictEqual(j.questions.steps.length, 6);
  });
});

(async () => {
  console.log('\nrisk profile');
  for (const { name, fn } of queue) {
    try { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
