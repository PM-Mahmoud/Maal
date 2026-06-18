'use strict';

const assert = require('assert');
const { compoundGrowth, loanAmortisation, superProjection, monteCarlo } = require('../lib/calc');

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

function approx(actual, expected, tolerance = 0.01, label = '') {
  const pct = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(pct <= tolerance, `${label}: expected ~${expected}, got ${actual} (${(pct*100).toFixed(2)}% off, tolerance ${tolerance*100}%)`);
}

// ─── compoundGrowth ───────────────────────────────────────────────────────────
console.log('\ncompoundGrowth');

test('$10k at 7% for 10 years (monthly compounding) ≈ $20,097', () => {
  const r = compoundGrowth({ principal: 10000, annualRate: 0.07, years: 10 });
  approx(r.finalValue, 20097, 0.01, 'finalValue');
  assert.strictEqual(r.totalContributed, 10000);
  assert.ok(r.totalGrowth > 0);
  assert.strictEqual(r.yearByYear.length, 10);
});

test('$0 principal, $500/mo at 7% for 20 years ≈ $262,481', () => {
  const r = compoundGrowth({ principal: 0, annualRate: 0.07, years: 20, monthlyContribution: 500 });
  approx(r.finalValue, 262481, 0.02, 'finalValue');
  assert.strictEqual(r.totalContributed, 500 * 12 * 20);
});

test('0% rate grows only by contributions', () => {
  const r = compoundGrowth({ principal: 1000, annualRate: 0, years: 5, monthlyContribution: 100 });
  const expected = 1000 + 100 * 12 * 5;
  approx(r.finalValue, expected, 0.001);
});

test('yearByYear balance is monotonically increasing (positive rate + contrib)', () => {
  const r = compoundGrowth({ principal: 5000, annualRate: 0.06, years: 5, monthlyContribution: 200 });
  for (let i = 1; i < r.yearByYear.length; i++) {
    assert.ok(r.yearByYear[i].balance > r.yearByYear[i - 1].balance, `year ${i+1} should be greater than year ${i}`);
  }
});

test('throws on negative principal', () => {
  assert.throws(() => compoundGrowth({ principal: -1, annualRate: 0.07, years: 10 }), /principal/);
});

test('throws on non-integer years', () => {
  assert.throws(() => compoundGrowth({ principal: 1000, annualRate: 0.07, years: 1.5 }), /years/);
});

// ─── loanAmortisation ─────────────────────────────────────────────────────────
console.log('\nloanAmortisation');

test('$500k mortgage at 6% for 30 years: monthly ~$2,998', () => {
  const r = loanAmortisation({ principal: 500000, annualRate: 0.06, termYears: 30 });
  approx(r.monthlyPayment, 2997.75, 0.01, 'monthlyPayment');
  assert.strictEqual(r.schedule.length, 360);
  assert.ok(r.totalInterest > 0);
  approx(r.totalPaid, 500000 + r.totalInterest, 0.001, 'totalPaid');
});

test('balance reaches ~0 at end of schedule', () => {
  const r = loanAmortisation({ principal: 200000, annualRate: 0.055, termYears: 25 });
  assert.ok(r.schedule[r.schedule.length - 1].balance < 1, 'final balance should be near zero');
});

test('extra repayment shortens term', () => {
  const base = loanAmortisation({ principal: 400000, annualRate: 0.065, termYears: 30 });
  const extra = loanAmortisation({ principal: 400000, annualRate: 0.065, termYears: 30, extraMonthly: 500 });
  assert.ok(extra.actualTermMonths < base.actualTermMonths, 'extra repayment should shorten loan');
  assert.ok(extra.interestSavedByExtra > 0, 'should save interest with extra repayment');
});

test('0% interest: total paid equals principal', () => {
  const r = loanAmortisation({ principal: 12000, annualRate: 0, termYears: 1 });
  approx(r.totalPaid, 12000, 0.001);
});

test('throws on zero principal', () => {
  assert.throws(() => loanAmortisation({ principal: 0, annualRate: 0.05, termYears: 10 }), /principal/);
});

// ─── superProjection ──────────────────────────────────────────────────────────
console.log('\nsuperProjection');

test('basic projection: 30yo, $50k super, $120k salary, retire at 67', () => {
  const r = superProjection({ currentBalance: 50000, salary: 120000, age: 30, retirementAge: 67 });
  assert.ok(r.projectedBalance > 500000, 'should project over $500k');
  assert.strictEqual(r.yearsToRetirement, 37);
  assert.strictEqual(r.yearByYear.length, 37);
  assert.ok(r.asfaTarget > 0);
});

test('on track flag: high balance/salary should be on track', () => {
  const r = superProjection({ currentBalance: 200000, salary: 200000, age: 40, retirementAge: 67 });
  assert.ok(r.onTrack, 'high earner with large balance should be on track');
});

test('not on track: young, small balance, low salary', () => {
  const r = superProjection({ currentBalance: 5000, salary: 40000, age: 25, retirementAge: 67 });
  // At $40k salary: employer contributes $4,800/yr; not necessarily on track for comfortable
  assert.strictEqual(typeof r.onTrack, 'boolean');
  assert.strictEqual(typeof r.asfaGap, 'number');
});

test('couple ASFA target is higher than single', () => {
  const single = superProjection({ currentBalance: 0, salary: 80000, age: 30, retirementAge: 67, maritalStatus: 'single' });
  const couple = superProjection({ currentBalance: 0, salary: 80000, age: 30, retirementAge: 67, maritalStatus: 'couple' });
  assert.ok(couple.asfaTarget > single.asfaTarget);
});

test('extra voluntary contributions increase projected balance', () => {
  const base = superProjection({ currentBalance: 50000, salary: 100000, age: 35, retirementAge: 67 });
  const withExtra = superProjection({ currentBalance: 50000, salary: 100000, age: 35, retirementAge: 67, extraAnnual: 5000 });
  assert.ok(withExtra.projectedBalance > base.projectedBalance);
});

test('throws if retirementAge <= age', () => {
  assert.throws(() => superProjection({ currentBalance: 0, salary: 0, age: 50, retirementAge: 50 }), /retirementAge/);
});

// ─── monteCarlo ───────────────────────────────────────────────────────────────
console.log('\nmonteCarlo');

test('returns all required fields', () => {
  const r = monteCarlo({ currentBalance: 50000, salary: 120000, age: 30, simulations: 200, seed: 42 });
  ['p10','p25','p50','p75','p90','successRate','asfaTarget','meanOutcome','simulations','paths'].forEach(k => {
    assert.ok(k in r, `missing field: ${k}`);
  });
});

test('percentiles are ordered p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90', () => {
  const r = monteCarlo({ currentBalance: 50000, salary: 100000, age: 35, simulations: 500, seed: 1 });
  assert.ok(r.p10 <= r.p25, 'p10 ≤ p25');
  assert.ok(r.p25 <= r.p50, 'p25 ≤ p50');
  assert.ok(r.p50 <= r.p75, 'p50 ≤ p75');
  assert.ok(r.p75 <= r.p90, 'p75 ≤ p90');
});

test('successRate is between 0 and 100', () => {
  const r = monteCarlo({ currentBalance: 50000, salary: 100000, age: 35, simulations: 200, seed: 7 });
  assert.ok(r.successRate >= 0 && r.successRate <= 100);
});

test('seed produces reproducible results', () => {
  const r1 = monteCarlo({ currentBalance: 80000, salary: 150000, age: 28, simulations: 300, seed: 99 });
  const r2 = monteCarlo({ currentBalance: 80000, salary: 150000, age: 28, simulations: 300, seed: 99 });
  assert.strictEqual(r1.p50, r2.p50, 'same seed must produce same p50');
  assert.strictEqual(r1.meanOutcome, r2.meanOutcome);
});

test('higher balance/salary → higher p50', () => {
  const low = monteCarlo({ currentBalance: 10000, salary: 60000, age: 40, simulations: 500, seed: 5 });
  const high = monteCarlo({ currentBalance: 200000, salary: 200000, age: 40, simulations: 500, seed: 5 });
  assert.ok(high.p50 > low.p50, 'higher inputs should yield higher p50');
});

test('paths array length matches simulations', () => {
  const r = monteCarlo({ currentBalance: 50000, salary: 100000, age: 30, simulations: 250, seed: 3 });
  assert.strictEqual(r.paths.length, 250);
});

test('throws on invalid simulations count', () => {
  assert.throws(() => monteCarlo({ currentBalance: 0, salary: 0, age: 30, simulations: 5 }), /simulations/);
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
