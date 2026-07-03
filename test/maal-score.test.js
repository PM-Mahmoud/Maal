'use strict';

// test/maal-score.test.js
// Deterministic tests for lib/maal-score.js computeMaalScore(), including a
// parity/contract test locking in the field mapping between
// db/assets.js getAssetSummary() output and computeMaalScore()'s expected
// profile shape. This is what protects the Maal Score during the Phase 3
// dashboard-aggregation refactor (see the assets-liabilities plan) — if a
// future caller maps assetSummary.investmentsTotal to the wrong profile
// field, this test catches it.

const assert = require('assert');
const { computeMaalScore } = require('../lib/maal-score');
const { summarizeAssets } = require('../db/assets');

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

// ─── computeMaalScore sanity checks ───
console.log('\ncomputeMaalScore');

test('null/empty profile returns hasData: false and a low-but-valid score', () => {
  const r = computeMaalScore(null);
  assert.strictEqual(r.hasData, false);
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.strictEqual(r.pillars.length, 5);
});

test('score is always between 0 and 100', () => {
  const r = computeMaalScore({ annual_income: 95000, super_balance: 150000, investment_portfolio: 50000, property_value: 800000, hecs_balance: 15000, total_debt: 5000 });
  assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score} out of range`);
});

test('higher assets with the same income never produce a lower score', () => {
  const base = { annual_income: 95000, super_balance: 50000, investment_portfolio: 10000, property_value: 0, hecs_balance: 0, total_debt: 0 };
  const richer = { ...base, super_balance: 300000, investment_portfolio: 200000 };
  const rBase = computeMaalScore(base);
  const rRicher = computeMaalScore(richer);
  assert.ok(rRicher.score >= rBase.score, `richer profile (${rRicher.score}) scored below base (${rBase.score})`);
});

test('more debt at the same income never produces a higher score', () => {
  const base = { annual_income: 95000, super_balance: 50000, investment_portfolio: 20000, total_debt: 0 };
  const indebted = { ...base, total_debt: 80000 };
  const rBase = computeMaalScore(base);
  const rIndebted = computeMaalScore(indebted);
  assert.ok(rIndebted.score <= rBase.score, `indebted profile (${rIndebted.score}) scored above base (${rBase.score})`);
});

// ─── parity: flat profile vs. asset-summary-derived profile ───
console.log('\nparity: flat columns vs. granular asset tables');

test('identical underlying values via flat columns vs. via getAssetSummary() produce identical scores', () => {
  // "Old way" — hand-typed flat profile, exactly as user_profiles rows look today.
  const flatProfile = {
    annual_income: 95000,
    super_balance: 150000,
    investment_portfolio: 42000,
    property_value: 620000,
    hecs_balance: 18000,
    total_debt: 7000,
    years_in_practice: 8,
    insurance_cover: 'full',
    has_private_health: true,
    retirement_age: 65,
    completed_onboarding: true,
  };

  // "New way" — same underlying values, but sourced through the granular
  // tables and summarizeAssets(), the way Phase 3's caller code will build
  // the profile object it passes to computeMaalScore().
  const assetSummary = summarizeAssets({
    superAccounts: [{ balance: '150000' }],
    investments: [{ value: '42000' }],
    properties: [{ value: '620000', mortgage_balance: '0' }],
    debts: [{ balance: '7000' }],
  });

  const derivedProfile = {
    annual_income: flatProfile.annual_income,
    super_balance: assetSummary.superTotal,
    investment_portfolio: assetSummary.investmentsTotal,
    property_value: assetSummary.propertyTotal,
    total_debt: assetSummary.debtsTotal,
    hecs_balance: flatProfile.hecs_balance, // HECS stays a flat column — explicit decision, see the plan
    years_in_practice: flatProfile.years_in_practice,
    insurance_cover: flatProfile.insurance_cover,
    has_private_health: flatProfile.has_private_health,
    retirement_age: flatProfile.retirement_age,
    completed_onboarding: flatProfile.completed_onboarding,
  };

  const scoreOld = computeMaalScore(flatProfile);
  const scoreNew = computeMaalScore(derivedProfile);
  assert.deepStrictEqual(scoreNew, scoreOld);
});

test('parity holds with multiple rows per type too (e.g. two properties, two debts)', () => {
  const flatProfile = {
    annual_income: 120000,
    super_balance: 90000,
    investment_portfolio: 15000,
    property_value: 950000, // two properties combined
    hecs_balance: 0,
    total_debt: 45000, // two debts combined
  };

  const assetSummary = summarizeAssets({
    superAccounts: [{ balance: '90000' }],
    investments: [{ value: '15000' }],
    properties: [{ value: '600000' }, { value: '350000' }],
    debts: [{ balance: '30000' }, { balance: '15000' }],
  });

  const derivedProfile = {
    annual_income: flatProfile.annual_income,
    super_balance: assetSummary.superTotal,
    investment_portfolio: assetSummary.investmentsTotal,
    property_value: assetSummary.propertyTotal,
    total_debt: assetSummary.debtsTotal,
    hecs_balance: flatProfile.hecs_balance,
  };

  assert.deepStrictEqual(computeMaalScore(derivedProfile), computeMaalScore(flatProfile));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
