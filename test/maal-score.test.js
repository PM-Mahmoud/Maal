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

test('every pillar exposes the rule, inputs, threshold, and outcome behind its score', () => {
  const result = computeMaalScore({
    annual_income: 120000,
    monthly_expenses: 4000,
    cash_savings: 12000,
    total_debt: 60000,
    hecs_balance: 20000,
    super_balance: 100000,
    age: 40,
    insurance_cover: 'partial',
  });

  assert.strictEqual(result.methodology_version, 'maal-health-rules-v1');
  assert.strictEqual(result.rules.length, 5);
  const savings = result.rules.find((rule) => rule.key === 'savings');
  assert.deepStrictEqual(savings.inputs, { cash_savings: 12000, monthly_expenses: 4000 });
  assert.strictEqual(savings.observed.value, 3);
  assert.deepStrictEqual(savings.target, { operator: '>=', value: 6, unit: 'months' });
  assert.strictEqual(savings.status, 'attention');
  assert.match(savings.explanation, /3 months/);
  assert.ok(result.rules.every((rule) => rule.formula && rule.pillar_weight > 0));
});

test('rules identify missing inputs instead of presenting fallback assumptions as user facts', () => {
  const result = computeMaalScore({ cash_savings: 5000 });
  const savings = result.rules.find((rule) => rule.key === 'savings');
  const superRule = result.rules.find((rule) => rule.key === 'super');
  assert.strictEqual(savings.status, 'needs_data');
  assert.strictEqual(savings.inputs.monthly_expenses, null);
  assert.strictEqual(savings.assumptions.monthly_expenses, 3500);
  assert.strictEqual(superRule.status, 'needs_data');
  assert.strictEqual(result.rules.find((rule) => rule.key === 'debt').status, 'needs_data');
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

// ─── The score must respond to what the user actually enters ─────────────────
// Regression origin: users reported that editing their profile never moved the
// score. Three inputs were being ignored entirely — cash_savings and
// monthly_expenses were never read, and income lived in a table the score's
// merge didn't consult.
console.log('\nprofile inputs actually move the score');

const { mergeAssetSummaryIntoProfile } = require('../db/assets');

test('entering real cash on hand raises the savings pillar', () => {
  const base = { annual_income: 120000, monthly_expenses: 4000 };
  const withCash = { ...base, cash_savings: 48000 }; // 12 months of buffer
  const pillar = (r) => r.pillars.find((x) => x.key === 'savings').score;
  assert.ok(pillar(computeMaalScore(withCash)) > pillar(computeMaalScore(base)),
    'cash on hand must improve the savings buffer pillar');
});

test('stated monthly expenses are used instead of the income heuristic', () => {
  const lean = { annual_income: 120000, cash_savings: 30000, monthly_expenses: 2000 };
  const heavy = { annual_income: 120000, cash_savings: 30000, monthly_expenses: 9000 };
  const pillar = (r) => r.pillars.find((x) => x.key === 'savings').score;
  assert.ok(pillar(computeMaalScore(lean)) > pillar(computeMaalScore(heavy)),
    'the same cash must last longer, and score higher, at a lower burn rate');
});

test('income recorded only in the incomes table reaches the score', () => {
  // A React-onboarded user: income lives in `incomes`, not the flat column.
  const summary = summarizeAssets({ incomes: [{ annual_amount: '150000' }] });
  const merged = mergeAssetSummaryIntoProfile({}, summary);
  assert.strictEqual(merged.annual_income, 150000, 'income must be merged, not dropped');
  assert.strictEqual(computeMaalScore(merged).hasData, true);
});

test('flat annual_income still wins when no income rows exist (no regression)', () => {
  const merged = mergeAssetSummaryIntoProfile({ annual_income: 90000 }, summarizeAssets({}));
  assert.strictEqual(merged.annual_income, 90000);
});

test('age comes from the chosen age band, not the legacy years_in_practice proxy', () => {
  // Same finances, different ages: a 60-year-old with this super balance is
  // behind the benchmark, a 27-year-old is comfortably ahead of it.
  const money = { annual_income: 120000, super_balance: 90000, cash_savings: 20000 };
  const young = computeMaalScore({ ...money, onboarding_data: { age_band: 'under-30' } });
  const older = computeMaalScore({ ...money, onboarding_data: { age_band: '60+' } });
  const superPillar = (r) => r.pillars.find((x) => x.key === 'super').score;
  assert.ok(superPillar(young) > superPillar(older),
    'the same balance must score better for a younger saver');
});

test('a numeric age on the normalised profile is honoured too', () => {
  const money = { annual_income: 120000, super_balance: 90000 };
  assert.notStrictEqual(
    computeMaalScore({ ...money, age: 27 }).score,
    computeMaalScore({ ...money, age: 62 }).score,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
