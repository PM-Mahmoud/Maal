'use strict';

// test/assets-summary.test.js
// Deterministic tests for db/assets.js summarizeAssets() — the pure
// row-summing function behind getAssetSummary(). No DB needed; per
// CLAUDE.md's hard rule, financial calculations need a test before merge.

const assert = require('assert');
const { summarizeAssets, wealthTotalsFromSummary, canonicalSummaryMatchesLegacy, mergeAssetSummaryIntoProfile } = require('../db/assets');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\nsummarizeAssets');

test('empty input (new user, zero rows everywhere) returns all zeros', () => {
  const r = summarizeAssets({});
  assert.deepStrictEqual(r, {
    cashTotal: 0, investmentsTotal: 0, propertyTotal: 0, propertyMortgageTotal: 0,
    debtsTotal: 0, superTotal: 0, incomeTotal: 0, otherAssetsTotal: 0,
  });
});

test('undefined input (no argument) does not throw, returns all zeros', () => {
  const r = summarizeAssets();
  assert.strictEqual(r.cashTotal, 0);
});

test('Postgres BIGINT-as-string balances are coerced correctly (the documented gotcha)', () => {
  const r = summarizeAssets({
    cashAccounts: [{ balance: '50000' }, { balance: '2500' }],
  });
  assert.strictEqual(r.cashTotal, 52500);
  assert.strictEqual(typeof r.cashTotal, 'number');
});

test('multiple rows of the same type sum correctly', () => {
  const r = summarizeAssets({
    properties: [{ value: '800000', mortgage_balance: '600000' }, { value: '450000', mortgage_balance: '0' }],
    debts: [{ balance: '5000' }, { balance: '12000' }, { balance: '300' }],
  });
  assert.strictEqual(r.propertyTotal, 1250000);
  assert.strictEqual(r.propertyMortgageTotal, 600000);
  assert.strictEqual(r.debtsTotal, 17300);
});

test('non-numeric / missing balance fields coerce to 0, never NaN', () => {
  const r = summarizeAssets({
    investments: [{ value: 'not-a-number' }, { value: undefined }, {}],
  });
  assert.strictEqual(r.investmentsTotal, 0);
  assert.ok(!Number.isNaN(r.investmentsTotal));
});

test('negative balances (e.g. an over-drawn account) are preserved, not clamped', () => {
  const r = summarizeAssets({
    cashAccounts: [{ balance: '-500' }, { balance: '1000' }],
  });
  assert.strictEqual(r.cashTotal, 500);
});

test('each table sums into its own independent total field', () => {
  const r = summarizeAssets({
    cashAccounts: [{ balance: 100 }],
    investments: [{ value: 200 }],
    properties: [{ value: 300, mortgage_balance: 30 }],
    debts: [{ balance: 400 }],
    superAccounts: [{ balance: 500 }],
    incomes: [{ annual_amount: 600 }],
    otherAssets: [{ value: 700 }],
  });
  assert.deepStrictEqual(r, {
    cashTotal: 100, investmentsTotal: 200, propertyTotal: 300, propertyMortgageTotal: 30,
    debtsTotal: 400, superTotal: 500, incomeTotal: 600, otherAssetsTotal: 700,
  });
});

console.log('\nwealthTotalsFromSummary');

test('net worth reconciles assets against debts and property mortgages exactly once', () => {
  const totals = wealthTotalsFromSummary({
    cashTotal: 10000,
    investmentsTotal: 20000,
    propertyTotal: 700000,
    superTotal: 100000,
    otherAssetsTotal: 5000,
    propertyMortgageTotal: 450000,
    debtsTotal: 15000,
  });
  assert.deepStrictEqual(totals, { assetTotal: 835000, liabilityTotal: 465000, netWorth: 370000 });
});

test('missing and Postgres string summary values remain deterministic', () => {
  assert.deepStrictEqual(wealthTotalsFromSummary({ cashTotal: '1000', debtsTotal: '250' }), {
    assetTotal: 1000,
    liabilityTotal: 250,
    netWorth: 750,
  });
});

test('canonical compatibility read requires component-level parity, not merely matching net worth', () => {
  const legacy = { cashTotal: 100, investmentsTotal: 200, propertyTotal: 0, propertyMortgageTotal: 0, debtsTotal: 50, superTotal: 0, otherAssetsTotal: 0 };
  assert.strictEqual(canonicalSummaryMatchesLegacy({ ...legacy }, legacy), true);
  assert.strictEqual(canonicalSummaryMatchesLegacy({ ...legacy, cashTotal: 150, debtsTotal: 100 }, legacy), false,
    'offsetting asset/debt errors can preserve net worth but must still fail parity');
});

console.log('\nmergeAssetSummaryIntoProfile (deployment-ordering safety)');

test('pre-backfill user (new tables empty) keeps reading their flat columns unchanged', () => {
  const flatProfile = { cash_savings: 5000, super_balance: 90000, investment_portfolio: 20000, property_value: 0, total_debt: 3000, hecs_balance: 15000 };
  const emptySummary = summarizeAssets({}); // no rows in any new table yet
  const merged = mergeAssetSummaryIntoProfile(flatProfile, emptySummary);
  assert.strictEqual(merged.cash_savings, 5000);
  assert.strictEqual(merged.super_balance, 90000);
  assert.strictEqual(merged.investment_portfolio, 20000);
  assert.strictEqual(merged.total_debt, 3000);
  assert.strictEqual(merged.hecs_balance, 15000, 'HECS must stay untouched — explicit out-of-scope decision');
});

test('backfilled/migrated user (new tables populated) switches to the granular totals', () => {
  const flatProfile = { cash_savings: 5000, super_balance: 90000, investment_portfolio: 20000, property_value: 0, total_debt: 3000 };
  const realSummary = summarizeAssets({
    cashAccounts: [{ balance: '8000' }],
    superAccounts: [{ balance: '95000' }],
    investments: [{ value: '25000' }],
    debts: [{ balance: '2000' }],
  });
  const merged = mergeAssetSummaryIntoProfile(flatProfile, realSummary);
  assert.strictEqual(merged.cash_savings, 8000);
  assert.strictEqual(merged.super_balance, 95000);
  assert.strictEqual(merged.investment_portfolio, 25000);
  assert.strictEqual(merged.total_debt, 2000);
});

test('partial migration (some tables populated, others still empty) merges per-field independently', () => {
  const flatProfile = { cash_savings: 5000, super_balance: 90000, investment_portfolio: 20000, property_value: 700000, total_debt: 3000 };
  // Only investments has been touched via the new asset modal so far — everything else pre-backfill.
  const partialSummary = summarizeAssets({ investments: [{ value: '25000' }] });
  const merged = mergeAssetSummaryIntoProfile(flatProfile, partialSummary);
  assert.strictEqual(merged.investment_portfolio, 25000, 'investments should switch over');
  assert.strictEqual(merged.cash_savings, 5000, 'cash should still fall back to flat column');
  assert.strictEqual(merged.super_balance, 90000, 'super should still fall back to flat column');
  assert.strictEqual(merged.property_value, 700000, 'property should still fall back to flat column');
  assert.strictEqual(merged.total_debt, 3000, 'debt should still fall back to flat column');
});

test('null profile does not throw, produces zeros where no summary data exists', () => {
  const merged = mergeAssetSummaryIntoProfile(null, summarizeAssets({}));
  assert.strictEqual(merged.cash_savings, 0);
  assert.strictEqual(merged.super_balance, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
