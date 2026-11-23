'use strict';
// Deterministic tests for Spending settings + budgets:
//  1. lib/spending-settings.js pure validation / money parsing / spending rule
//  2. db/budgets.js — every statement is user-scoped (IDOR guard)
//  3. routes/spending-settings.js — auth, validation, 404 on a foreign budget,
//     reset deletes only the caller's budgets
// No database or network: the pg pool is a recording stub and the router runs
// over a loopback HTTP server with an injected fake db.

const assert = require('assert');
const http = require('http');
const express = require('express');

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ─── 1. Pure helpers ─────────────────────────────────────────────────────────
const s = require('../lib/spending-settings');

test('normaliseSettings applies defaults and drops unknown groups', () => {
  assert.deepStrictEqual(s.normaliseSettings(null), { include_upcoming: true, excluded_groups: ['Income', 'Credit Card Payments', 'Transfers'] });
  assert.deepStrictEqual(
    s.normaliseSettings({ include_upcoming: false, excluded_groups: ['Shopping', 'Nope', 'Transfers'], evil: 1 }),
    { include_upcoming: false, excluded_groups: ['Transfers', 'Shopping'] },
  );
  assert.strictEqual(s.normaliseSettings({ include_upcoming: 'yes' }).include_upcoming, true);
  assert.deepStrictEqual(s.normaliseSettings({ excluded_groups: [] }).excluded_groups, []);
});

test('validateSettingsPatch is strict about types and groups', () => {
  assert.ok(s.validateSettingsPatch(null).error);
  assert.ok(s.validateSettingsPatch({}).error);
  assert.ok(s.validateSettingsPatch({ include_upcoming: 'false' }).error);
  assert.ok(s.validateSettingsPatch({ excluded_groups: 'Transfers' }).error);
  assert.ok(s.validateSettingsPatch({ excluded_groups: ['Transfers', 'Crypto'] }).error);
  assert.deepStrictEqual(s.validateSettingsPatch({ include_upcoming: false, other: 1 }), { patch: { include_upcoming: false } });
  assert.deepStrictEqual(
    s.validateSettingsPatch({ excluded_groups: ['Shopping', 'Transfers', 'Shopping'] }),
    { patch: { excluded_groups: ['Transfers', 'Shopping'] } },
  );
});

test('countsAsSpending follows the excluded groups (defaults exclude transfers/card repayments/income)', () => {
  assert.strictEqual(s.countsAsSpending('Food & Dining', null), true);
  assert.strictEqual(s.countsAsSpending('Transfers', null), false);
  assert.strictEqual(s.countsAsSpending('Credit Card Payments', {}), false);
  assert.strictEqual(s.countsAsSpending('Income', {}), false);
  assert.strictEqual(s.countsAsSpending('Transfers', { excluded_groups: [] }), true);
  assert.strictEqual(s.countsAsSpending('Shopping', { excluded_groups: ['Shopping'] }), false);
  assert.strictEqual(s.countsAsSpending(null, { excluded_groups: ['Other'] }), false);
});

test('parseBudgetAmount accepts AUD strings, rounds to cents, rejects junk', () => {
  assert.strictEqual(s.parseBudgetAmount(275), 275);
  assert.strictEqual(s.parseBudgetAmount('$1,250.50'), 1250.5);
  assert.strictEqual(s.parseBudgetAmount(' 99.999 '), 100);
  assert.strictEqual(s.parseBudgetAmount('AUD 40'), 40);
  assert.strictEqual(s.parseBudgetAmount(0.004), null); // rounds to 0
  for (const bad of [0, -5, '-5', 'abc', '', '1e5', NaN, Infinity, null, undefined, {}, s.MAX_BUDGET_AUD + 1]) {
    assert.strictEqual(s.parseBudgetAmount(bad), null, String(bad));
  }
});

test('validateBudgetInput: null/empty group = overall budget, unknown group rejected', () => {
  assert.deepStrictEqual(s.validateBudgetInput({ monthly_amount: '275' }), { budget: { category_group: null, monthly_amount: 275 } });
  assert.deepStrictEqual(s.validateBudgetInput({ category_group: '', monthly_amount: 10 }), { budget: { category_group: null, monthly_amount: 10 } });
  assert.deepStrictEqual(s.validateBudgetInput({ category_group: 'Food & Dining', monthly_amount: 600 }), { budget: { category_group: 'Food & Dining', monthly_amount: 600 } });
  assert.ok(s.validateBudgetInput({ category_group: 'Crypto', monthly_amount: 10 }).error);
  assert.ok(s.validateBudgetInput({ monthly_amount: 0 }).error);
  assert.ok(s.validateBudgetInput(null).error);
});

test('toBudget coerces NUMERIC/BIGINT strings; totalMonthlyBudget prefers the overall budget', () => {
  const b = s.toBudget({ id: 7, category_group: null, monthly_amount: '275.00', updated_at: 'u' });
  assert.deepStrictEqual(b, { id: '7', category_group: null, monthly_amount: 275, updated_at: 'u' });
  assert.strictEqual(typeof b.monthly_amount, 'number');
  assert.strictEqual(s.totalMonthlyBudget([]), 0);
  // Cents arithmetic — no 0.1 + 0.2 float drift.
  assert.strictEqual(s.totalMonthlyBudget([{ category_group: 'Shopping', monthly_amount: 0.1 }, { category_group: 'Housing', monthly_amount: 0.2 }]), 0.3);
  assert.strictEqual(s.totalMonthlyBudget([{ category_group: 'Shopping', monthly_amount: '100' }, { category_group: null, monthly_amount: '275' }]), 275);
});

test('parseId accepts positive integer ids only', () => {
  assert.strictEqual(s.parseId('42'), '42');
  for (const bad of ['0', '-1', '1.5', 'abc', '1;DROP', '', null, '9'.repeat(19)]) assert.strictEqual(s.parseId(bad), null, String(bad));
});

// ─── 2. db/budgets.js — user-scoped SQL ──────────────────────────────────────
const calls = [];
let nextResults = [];
global.__maalPool = {
  query: async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return nextResults.length ? nextResults.shift() : { rows: [], rowCount: 0 };
  },
};
const db = require('../db/budgets');
const last = () => calls[calls.length - 1];
function assertScoped(call, uid) {
  const m = call.sql.match(/user_id = \$(\d)/);
  assert.ok(m, `missing user_id filter: ${call.sql}`);
  assert.strictEqual(call.params[Number(m[1]) - 1], uid, 'user_id param mismatch');
}

test('listBudgets / deleteAllBudgets / getSettings filter by user_id', async () => {
  await db.listBudgets(9); assertScoped(last(), 9);
  nextResults = [{ rows: [], rowCount: 3 }];
  assert.strictEqual(await db.deleteAllBudgets(9), 3); assertScoped(last(), 9);
  assert.ok(/^DELETE FROM budgets WHERE user_id = \$1$/.test(last().sql));
  assert.strictEqual(await db.getSettings(9), null); assertScoped(last(), 9);
});

test('deleteBudget filters by id AND user_id and reports ownership', async () => {
  nextResults = [{ rows: [], rowCount: 0 }];
  assert.strictEqual(await db.deleteBudget('3', 9), false);
  assert.ok(/WHERE id = \$1 AND user_id = \$2/.test(last().sql));
  assert.deepStrictEqual(last().params, ['3', 9]);
  nextResults = [{ rows: [], rowCount: 1 }];
  assert.strictEqual(await db.deleteBudget('3', 9), true);
});

test('upsertBudget inserts for the session user and upserts on (user, group)', async () => {
  nextResults = [{ rows: [{ id: 1, category_group: null, monthly_amount: '275.00' }] }];
  await db.upsertBudget(9, { category_group: null, monthly_amount: 275 });
  assert.deepStrictEqual(last().params, [9, null, 275]);
  assert.ok(/ON CONFLICT \(user_id, COALESCE\(category_group, ''\)\)/.test(last().sql));
});

test('updateSettings merges JSONB for the session user only', async () => {
  nextResults = [{ rows: [{ settings: { include_upcoming: false } }] }];
  const out = await db.updateSettings(9, { include_upcoming: false });
  assert.deepStrictEqual(out, { include_upcoming: false });
  assertScoped(last(), 9);
  assert.strictEqual(last().params[0], 9);
  assert.strictEqual(last().params[1], JSON.stringify({ include_upcoming: false }));
});

// ─── 3. Router ───────────────────────────────────────────────────────────────
const { createSpendingSettingsRouter } = require('../routes/spending-settings');

function makeFakeDb() {
  const budgets = new Map([
    ['10', { id: 10, user_id: 1, category_group: null, monthly_amount: '275.00' }],
    ['20', { id: 20, user_id: 2, category_group: null, monthly_amount: '900.00' }],
  ]);
  const settings = new Map();
  let seq = 30;
  return {
    budgets, settings,
    listBudgets: async (uid) => [...budgets.values()].filter((b) => b.user_id === uid),
    upsertBudget: async (uid, b) => {
      const ex = [...budgets.values()].find((r) => r.user_id === uid && r.category_group === b.category_group);
      if (ex) { ex.monthly_amount = String(b.monthly_amount); return ex; }
      const r = { id: seq++, user_id: uid, ...b, monthly_amount: String(b.monthly_amount) };
      budgets.set(String(r.id), r); return r;
    },
    deleteBudget: async (id, uid) => { const r = budgets.get(String(id)); if (!r || r.user_id !== uid) return false; budgets.delete(String(id)); return true; },
    deleteAllBudgets: async (uid) => { let n = 0; for (const [k, r] of budgets) if (r.user_id === uid) { budgets.delete(k); n++; } return n; },
    getSettings: async (uid) => settings.get(uid) || null,
    updateSettings: async (uid, patch) => { const m = { ...(settings.get(uid) || {}), ...patch }; settings.set(uid, m); return m; },
  };
}

async function withServer(fakeDb, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const u = req.headers['x-user']; req.session = u ? { userId: Number(u) } : {}; next(); });
  app.use('/api', createSpendingSettingsRouter({ db: fakeDb, categoriesDb: { customCategoryNames: async (uid) => (uid === 1 ? ['Pets'] : []) } }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, path, { user, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': String(user) } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try { await fn(call); } finally { server.close(); }
}

test('router requires a session for every endpoint', async () => {
  await withServer(makeFakeDb(), async (call) => {
    for (const [m, p] of [['GET', '/spending-settings'], ['PATCH', '/spending-settings'], ['GET', '/budgets'], ['PUT', '/budgets'], ['DELETE', '/budgets'], ['DELETE', '/budgets/10']]) {
      assert.strictEqual((await call(m, p)).status, 401, `${m} ${p}`);
    }
  });
});

test('settings: defaults, validated patch, merged result', async () => {
  await withServer(makeFakeDb(), async (call) => {
    const g = await call('GET', '/spending-settings', { user: 1 });
    assert.strictEqual(g.json.settings.include_upcoming, true);
    assert.strictEqual((await call('PATCH', '/spending-settings', { user: 1, body: { include_upcoming: 'no' } })).status, 400);
    const p = await call('PATCH', '/spending-settings', { user: 1, body: { include_upcoming: false } });
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.json.settings.include_upcoming, false);
    assert.ok(p.json.settings.excluded_groups.includes('Transfers'));
  });
});

test('budgets: list own only, upsert validates, total is a number', async () => {
  await withServer(makeFakeDb(), async (call) => {
    const l = await call('GET', '/budgets', { user: 1 });
    assert.deepStrictEqual(l.json.budgets.map((b) => b.id), ['10']);
    assert.strictEqual(l.json.total, 275);
    assert.strictEqual((await call('PUT', '/budgets', { user: 1, body: { monthly_amount: -1 } })).status, 400);
    const u = await call('PUT', '/budgets', { user: 1, body: { monthly_amount: '$300' } });
    assert.strictEqual(u.json.budget.monthly_amount, 300);
    assert.strictEqual(u.json.budget.id, '10');
  });
});

test('budgets: a custom category (Session 2) takes a budget; another user\'s custom name does not', async () => {
  await withServer(makeFakeDb(), async (call) => {
    const ok = await call('PUT', '/budgets', { user: 1, body: { category_group: 'Pets', monthly_amount: 80 } });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.json.budget.category_group, 'Pets');
    assert.strictEqual((await call('PUT', '/budgets', { user: 2, body: { category_group: 'Pets', monthly_amount: 80 } })).status, 400);
  });
});

test('delete one: a foreign or malformed id is a 404 and changes nothing', async () => {
  const fake = makeFakeDb();
  await withServer(fake, async (call) => {
    assert.strictEqual((await call('DELETE', '/budgets/20', { user: 1 })).status, 404);
    assert.strictEqual((await call('DELETE', '/budgets/abc', { user: 1 })).status, 404);
    assert.ok(fake.budgets.has('20'));
    assert.strictEqual((await call('DELETE', '/budgets/10', { user: 1 })).status, 200);
    assert.ok(!fake.budgets.has('10'));
  });
});

test('reset deletes only the caller\'s budgets', async () => {
  const fake = makeFakeDb();
  await withServer(fake, async (call) => {
    const r = await call('DELETE', '/budgets', { user: 1 });
    assert.deepStrictEqual(r.json, { ok: true, deleted: 1 });
    assert.ok(fake.budgets.has('20'));
    assert.strictEqual((await call('GET', '/budgets', { user: 1 })).json.total, 0);
  });
});

(async () => {
  for (const { name, fn } of queue) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e && e.stack}`); }
  }
  console.log(`\nspending-settings: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
