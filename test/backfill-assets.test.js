'use strict';

// test/backfill-assets.test.js
// Deterministic tests for scripts/backfill-assets.js — the pure
// verification-delta calculation and each field's row-shaping function.
// No DB needed. Per CLAUDE.md's hard rule, financial calculations need a
// test before merge, and this script touches every existing user's data.

const assert = require('assert');
const { computeVerificationDelta, FIELD_MAP } = require('../scripts/backfill-assets');

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

console.log('\ncomputeVerificationDelta');

test('identical totals (nothing backfilled yet, summary all zero) shows the flat total as a mismatch by design', () => {
  // Before backfill runs, the new-table summary is genuinely empty — this
  // function compares raw totals, it does NOT know about the
  // mergeAssetSummaryIntoProfile fallback. A pre-backfill user is EXPECTED
  // to mismatch here; this test documents that expectation so it's not
  // mistaken for a bug later.
  const profile = { cash_savings: 5000, investment_portfolio: 0, property_value: 0, super_balance: 0, total_debt: 0 };
  const emptySummary = { cashTotal: 0, investmentsTotal: 0, propertyTotal: 0, superTotal: 0, debtsTotal: 0 };
  const r = computeVerificationDelta(profile, emptySummary);
  assert.strictEqual(r.matches, false);
  assert.strictEqual(r.oldTotal, 5000);
  assert.strictEqual(r.newTotal, 0);
});

test('matching totals after backfill (summary mirrors the flat profile)', () => {
  const profile = { cash_savings: 5000, investment_portfolio: 20000, property_value: 600000, super_balance: 90000, total_debt: 7000 };
  const summary = { cashTotal: 5000, investmentsTotal: 20000, propertyTotal: 600000, superTotal: 90000, debtsTotal: 7000 };
  const r = computeVerificationDelta(profile, summary);
  assert.strictEqual(r.matches, true);
  assert.strictEqual(r.delta, 0);
});

test('within-a-cent rounding difference still counts as matching', () => {
  const profile = { cash_savings: 5000, investment_portfolio: 0, property_value: 0, super_balance: 0, total_debt: 0 };
  const summary = { cashTotal: 5001, investmentsTotal: 0, propertyTotal: 0, superTotal: 0, debtsTotal: 0 };
  const r = computeVerificationDelta(profile, summary);
  assert.strictEqual(r.matches, true);
});

test('a genuine mismatch (e.g. double-counted backfill) is flagged', () => {
  const profile = { cash_savings: 5000, investment_portfolio: 0, property_value: 0, super_balance: 0, total_debt: 0 };
  const summary = { cashTotal: 10000, investmentsTotal: 0, propertyTotal: 0, superTotal: 0, debtsTotal: 0 };
  const r = computeVerificationDelta(profile, summary);
  assert.strictEqual(r.matches, false);
  assert.strictEqual(r.delta, 5000);
});

test('debt is subtracted, not added, in both old and new totals', () => {
  const profile = { cash_savings: 10000, investment_portfolio: 0, property_value: 0, super_balance: 0, total_debt: 3000 };
  const summary = { cashTotal: 10000, investmentsTotal: 0, propertyTotal: 0, superTotal: 0, debtsTotal: 3000 };
  const r = computeVerificationDelta(profile, summary);
  assert.strictEqual(r.oldTotal, 7000);
  assert.strictEqual(r.newTotal, 7000);
  assert.strictEqual(r.matches, true);
});

console.log('\nFIELD_MAP row shaping');

test('cash_savings shapes into a cash_accounts row tagged source=backfill', () => {
  const field = FIELD_MAP.find((f) => f.flatField === 'cash_savings');
  const row = field.shape(5000);
  assert.strictEqual(row.balance, 5000);
  assert.strictEqual(row.source, 'backfill');
});

test('total_debt shapes into a debts row tagged source=backfill', () => {
  const field = FIELD_MAP.find((f) => f.flatField === 'total_debt');
  const row = field.shape(7000);
  assert.strictEqual(row.balance, 7000);
  assert.strictEqual(row.source, 'backfill');
});

test('hecs_balance is NOT in FIELD_MAP (explicit out-of-scope decision)', () => {
  const field = FIELD_MAP.find((f) => f.flatField === 'hecs_balance');
  assert.strictEqual(field, undefined);
});

test('FIELD_MAP covers exactly the 5 relationalized flat columns', () => {
  const fields = FIELD_MAP.map((f) => f.flatField).sort();
  assert.deepStrictEqual(fields, ['cash_savings', 'investment_portfolio', 'property_value', 'super_balance', 'total_debt'].sort());
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
