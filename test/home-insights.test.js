'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildHomeInsights } = require('../lib/home-insights');

test('Home runway uses only the visible split amounts and excludes transfer legs', async () => {
  const { effectiveTransactions } = await import('../shared/transaction-splits.mjs');
  const transactions = effectiveTransactions([
    { id: 'ordinary', amount: -1000, category_group: 'Housing' },
    { id: 'ignored', amount: -100, hidden: true },
    { id: 'split', amount: -600, splits: [
      { amount: 500, category_group: 'Groceries' },
      { amount: 100, hidden: true },
    ] },
    { id: 'own-transfer', amount: -3500, relationship_type: 'internal_transfer' },
    { id: 'repayment', amount: -1600, relationship_type: 'card_repayment' },
  ]);

  const report = buildHomeInsights({
    profile: { cash_savings: 6000, annual_income: 45000 },
    hasCash: true,
    transactions,
    date: new Date(2026, 7, 1),
  });
  assert.deepEqual(report, {
    cashRunwayMonths: 4,
    taxImpact: { fiscalYear: '2026-27', total: 4920 },
  });
});

test('Home preserves a known zero balance and distinguishes missing numbers', () => {
  const common = { profile: { cash_savings: 0, monthly_expenses: 800 }, date: new Date(2026, 5, 1) };
  const debit = [{ amount: -680, category_group: 'Other' }];
  assert.equal(buildHomeInsights({ ...common, hasCash: true, transactions: debit }).cashRunwayMonths, 0);
  assert.equal(buildHomeInsights({ ...common, hasCash: false, transactions: debit }).cashRunwayMonths, null);
  assert.deepEqual(buildHomeInsights({ ...common, hasCash: true, transactions: [] }), {
    cashRunwayMonths: null,
    taxImpact: { fiscalYear: '2025-26', total: null },
  });
});

test('Home estimates switch financial years at Australian midnight', () => {
  const request = { profile: { annual_income: 45000 }, hasCash: false, transactions: [] };
  const before = buildHomeInsights({ ...request, date: new Date('2026-06-30T13:59:00Z') });
  const after = buildHomeInsights({ ...request, date: new Date('2026-06-30T14:00:00Z') });
  assert.deepEqual(before.taxImpact, { fiscalYear: '2025-26', total: 5188 });
  assert.deepEqual(after.taxImpact, { fiscalYear: '2026-27', total: 4920 });
});

test('Home insights rejects unsigned requests and scopes every lookup to the session owner', async (t) => {
  const profiles = require('../db/profiles');
  const assets = require('../db/assets');
  const transactions = require('../db/transactions');
  const { homeInsightsHandler } = require('../services/home-insights');
  const lookups = [
    [profiles, 'getProfileByUserId', { annual_income: 45000 }],
    [assets, 'listCashAccounts', [{ balance: 6000 }]],
    [assets, 'listIncomes', []],
    [transactions, 'getCashFlowTransactions', [{ amount: -1500, category_group: 'Housing' }]],
  ].map(([module, name, fixture]) => t.mock.method(module, name, async (id) => {
    assert.equal(id, 314);
    return fixture;
  }));
  const response = { code: 200, data: null, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };

  await homeInsightsHandler({ session: {}, query: { user_id: 700 } }, response);
  assert.equal(response.code, 401);
  assert.ok(lookups.every((lookup) => lookup.mock.callCount() === 0));

  response.code = 200;
  await homeInsightsHandler({ session: { userId: 314 }, query: { user_id: 700 } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.data.cashRunwayMonths, 4);
  assert.ok(lookups.every((lookup) => lookup.mock.callCount() === 1));
});
