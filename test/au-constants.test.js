'use strict';
// Deterministic tests for lib/au-constants.js — including the ANNUAL REVIEW
// CONTRACT: the freshness test FAILS when the financial year containing
// today's date has no reviewed constants entry. When this fails every July,
// that is by design — review the figures against the ATO, add/update the FY
// entry with a `reviewed` date, and re-run.

const assert = require('assert');
const {
  CONSTANT_SETS,
  fyForDate,
  getConstants,
  computeIncomeTax,
  computeHecsRepayment,
  buildConstantsPrompt,
} = require('../lib/au-constants');
const { estimateTax } = require('../lib/tax');

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

// ─── FY lookup ────────────────────────────────────────────────────────────────
console.log('\nfyForDate / getConstants');

test('AU financial year boundaries (1 July)', () => {
  assert.strictEqual(fyForDate('2026-06-30'), '2025-26');
  assert.strictEqual(fyForDate('2026-07-01'), '2026-27');
  assert.strictEqual(fyForDate('2027-01-15'), '2026-27');
  assert.strictEqual(fyForDate('2025-12-31'), '2025-26');
});

test('date-based lookup returns the set in force on that date', () => {
  assert.strictEqual(getConstants('2026-06-15').fy, '2025-26');
  assert.strictEqual(getConstants('2026-07-15').fy, '2026-27');
});

test('historical FY2025-26 set keeps its own rates (16% second bracket)', () => {
  const c = getConstants('2026-01-01');
  assert.strictEqual(c.incomeTaxBrackets[1].rate, 0.16);
  assert.strictEqual(c.hecs.minThreshold, 67000);
  assert.strictEqual(c.super.concessionalCap, 30000);
});

test('date before the earliest constants entry falls back to the oldest set and flags stale', () => {
  const c = getConstants('2024-01-01'); // FY2023-24 — no entry exists
  assert.strictEqual(c.stale, true);
  assert.strictEqual(c.wantedFy, '2023-24');
  assert.strictEqual(c.fy, '2025-26'); // best-effort fallback to the oldest known set
});

// ─── FRESHNESS ALARM (annual review contract) ─────────────────────────────────
console.log('\nfreshness (annual review contract)');

test('current FY has a reviewed constants entry — if this fails, review the figures against the ATO and add the FY entry', () => {
  const fy = fyForDate();
  const set = CONSTANT_SETS[fy];
  assert.ok(set, 'No constants entry for current FY ' + fy + ' — annual review required (lib/au-constants.js)');
  assert.ok(set.reviewed, 'Constants entry for FY ' + fy + ' has no `reviewed` date — a human must verify the figures');
  assert.ok(!getConstants().stale, 'getConstants() fell back to a stale set');
});

test('every set has sources and an effectiveFrom of 1 July', () => {
  for (const set of Object.values(CONSTANT_SETS)) {
    assert.ok(Array.isArray(set.sources) && set.sources.length > 0, set.fy + ' missing sources');
    assert.ok(set.effectiveFrom.endsWith('-07-01'), set.fy + ' effectiveFrom must be 1 July');
    assert.strictEqual(fyForDate(set.effectiveFrom), set.fy, set.fy + ' effectiveFrom/fy mismatch');
  }
});

test('invariant sanity: SG 12% final, CGT 50% discount >12 months', () => {
  for (const set of Object.values(CONSTANT_SETS)) {
    assert.strictEqual(set.super.sgRate, 0.12, set.fy + ' SG rate');
    assert.strictEqual(set.cgt.discountRate, 0.50, set.fy + ' CGT discount');
    assert.strictEqual(set.cgt.discountMinHoldMonths, 12, set.fy + ' CGT hold period');
  }
});

// ─── Income tax (FY2026-27: 15% second bracket) ───────────────────────────────
console.log('\ncomputeIncomeTax (FY2026-27)');

const D = '2026-07-15'; // a date inside FY2026-27

test('$45,000: $4,020 bracket tax − $325 LITO + $900 Medicare = $4,595', () => {
  const r = computeIncomeTax(45000, D);
  assert.strictEqual(r.incomeTax, 3695);
  assert.strictEqual(r.medicare, 900);
  assert.strictEqual(r.totalTax, 4595);
  assert.strictEqual(r.netIncome, 40405);
});

test('$100,000: $20,520 bracket tax (no LITO) + $2,000 Medicare = $22,520', () => {
  const r = computeIncomeTax(100000, D);
  assert.strictEqual(r.incomeTax, 20520);
  assert.strictEqual(r.medicare, 2000);
  assert.strictEqual(r.totalTax, 22520);
});

test('$18,200: zero tax, zero Medicare (below low-income threshold)', () => {
  const r = computeIncomeTax(18200, D);
  assert.strictEqual(r.totalTax, 0);
});

test('same income taxed MORE in FY2025-26 (16% vs 15% second bracket)', () => {
  const now = computeIncomeTax(45000, D).totalTax;
  const prior = computeIncomeTax(45000, '2026-06-15').totalTax;
  assert.strictEqual(prior - now, 268); // the legislated $268 cut
});

// ─── HECS marginal system (FY2026-27) ─────────────────────────────────────────
console.log('\ncomputeHecsRepayment (FY2026-27 marginal system)');

test('below $69,528 threshold: no repayment', () => {
  assert.strictEqual(computeHecsRepayment(69000, 20000, D).annualRepayment, 0);
});

test('$80,000: 15c on income above threshold = $1,571', () => {
  assert.strictEqual(computeHecsRepayment(80000, 50000, D).annualRepayment, 1571);
});

test('$150,000: $9,028 band 1 + 17c band 2 = $12,476', () => {
  assert.strictEqual(computeHecsRepayment(150000, 50000, D).annualRepayment, 12476);
});

test('$200,000 (above $186,050): flat 10% of total income = $20,000', () => {
  assert.strictEqual(computeHecsRepayment(200000, 50000, D).annualRepayment, 20000);
});

test('repayment never exceeds the remaining balance', () => {
  assert.strictEqual(computeHecsRepayment(200000, 5000, D).annualRepayment, 5000);
});

test('zero HECS balance never triggers a repayment regardless of income', () => {
  const r = computeHecsRepayment(300000, 0, D);
  assert.strictEqual(r.annualRepayment, 0);
  assert.strictEqual(r.yearsToPayOff, null);
});

test('negative taxable income is clamped to zero (no negative tax)', () => {
  const r = computeIncomeTax(-5000, D);
  assert.strictEqual(r.grossIncome, 0);
  assert.strictEqual(r.totalTax, 0);
  assert.strictEqual(r.netIncome, 0);
});

test('band boundaries are continuous (no cliff in the repayment curve)', () => {
  for (const set of Object.values(CONSTANT_SETS)) {
    const h = set.hecs;
    const band1Total = (h.band1To - h.minThreshold) * h.band1Rate;
    const marginalAtSwitch = band1Total + (h.tenPercentAbove - h.band1To) * h.band2Rate;
    const flatAtSwitch = h.tenPercentAbove * 0.10;
    assert.ok(Math.abs(marginalAtSwitch - flatAtSwitch) < 2,
      set.fy + ': marginal curve (' + marginalAtSwitch.toFixed(0) + ') must meet 10% rule (' + flatAtSwitch.toFixed(0) + ') at $' + h.tenPercentAbove);
  }
});

// ─── lib/tax.js consumes the same constants ───────────────────────────────────
console.log('\nlib/tax.js (single source of truth)');

test('estimateTax uses the current-FY brackets and HECS bands', () => {
  // $100k is past LITO phase-out, so tax.js (no LITO) must match computeIncomeTax exactly
  const r = estimateTax({ annual_income: 100000, hecs_balance: 30000 });
  const expected = computeIncomeTax(100000);
  assert.strictEqual(r.incomeTax, expected.incomeTax);
  assert.strictEqual(r.medicare, expected.medicare);
  assert.strictEqual(r.hecs, computeHecsRepayment(100000, 30000).annualRepayment);
});

// ─── Prompt injection stays in sync with the data ─────────────────────────────
console.log('\nbuildConstantsPrompt');

test('prompt is derived from the current set (never drifts from the data)', () => {
  const p = buildConstantsPrompt(D);
  assert.ok(p.includes('FY2026-27'), 'FY label');
  assert.ok(p.includes('15%'), 'second bracket 15%');
  assert.ok(p.includes('$69,528'), 'HECS threshold');
  assert.ok(p.includes('SG rate 12.0%'), 'SG rate');
  assert.ok(p.includes('$32,500'), 'concessional cap');
  assert.ok(p.includes('AUTHORITATIVE'), 'authority marker');
});

test('historical prompt renders the historical figures', () => {
  const p = buildConstantsPrompt('2026-06-15');
  assert.ok(p.includes('FY2025-26'));
  assert.ok(p.includes('16%'));
  assert.ok(p.includes('$67,000'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
