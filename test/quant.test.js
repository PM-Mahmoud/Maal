'use strict';
// Deterministic tests for lib/quant.js — the deep-research quant core (PR 8).
// Financial-calculation rule: this math is covered before merge. Monte-Carlo is
// seeded, so its percentiles are reproducible.

const assert = require('assert');
const q = require('../lib/quant');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}
function approx(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);
}

console.log('\nquant core');

test('dailyReturns computes simple period returns, skips zero-price divisions', () => {
  const r = q.dailyReturns([100, 110, 99]);
  assert.strictEqual(r.length, 2);
  approx(r[0], 0.1);
  approx(r[1], -0.1);
  assert.deepStrictEqual(q.dailyReturns([]), []);
  assert.deepStrictEqual(q.dailyReturns([100]), []);
});

test('mean / variance / stdev (sample, n-1)', () => {
  approx(q.mean([1, 2, 3, 4]), 2.5);
  approx(q.variance([2, 4, 4, 4, 5, 5, 7, 9]), 4.571428, 1e-5); // classic sample-var example
  approx(q.stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(4.571428), 1e-4);
  assert.strictEqual(q.variance([5]), 0); // too short → 0, not NaN
});

test('covariance of two series (perfectly correlated → equals variance)', () => {
  const a = [1, 2, 3, 4, 5];
  approx(q.covariance(a, a), q.variance(a));
});

test('beta = cov/var; asset == market → beta 1; flat market → 0', () => {
  const market = q.dailyReturns([100, 101, 103, 102, 105]);
  assert.strictEqual(q.beta(market, market), 1);
  assert.strictEqual(q.beta([0.1, 0.2], [0, 0]), 0); // var 0 → guarded
});

test('beta of a 2x-levered asset is ~2', () => {
  const market = [0.01, -0.02, 0.03, -0.01, 0.02];
  const asset = market.map((r) => 2 * r);
  approx(q.beta(asset, market), 2, 1e-6);
});

test('annualizedVol scales daily stdev by sqrt(252)', () => {
  const r = [0.01, -0.01, 0.02, -0.02, 0.015];
  approx(q.annualizedVol(r), q.stdev(r) * Math.sqrt(252), 1e-6);
});

test('annualizedReturn (CAGR) — doubling over 252 days ≈ 100%', () => {
  const prices = [100];
  for (let i = 0; i < 252; i++) prices.push(prices[prices.length - 1] * Math.pow(2, 1 / 252));
  approx(q.annualizedReturn(prices), 1.0, 1e-6);
});

test('maxDrawdown is a negative fraction; monotically rising series → 0', () => {
  assert.strictEqual(q.maxDrawdown([1, 2, 3, 4]), 0);
  approx(q.maxDrawdown([100, 120, 60, 90]), 0.5 * -1, 1e-9); // 120 → 60 = -50%
  assert.strictEqual(q.maxDrawdown([100]), 0);
});

test('historicalVaR 95% returns a positive loss magnitude', () => {
  const returns = [];
  for (let i = 0; i < 100; i++) returns.push((i - 50) / 1000); // -0.05 .. 0.049
  const v = q.historicalVaR(returns, 0.95);
  assert.ok(v > 0, 'VaR should be positive');
  // 100 sorted returns -0.05..0.049; q=0.05 → index floor(5)=5 → -0.045 → VaR 0.045
  approx(v, 0.045, 1e-9);
  assert.strictEqual(q.historicalVaR([], 0.95), 0);
});

test('monteCarlo is deterministic for a fixed seed (reproducible percentiles)', () => {
  const a = q.monteCarlo({ start: 10000, expectedReturn: 0.07, vol: 0.15, days: 252, sims: 500, seed: 42 });
  const b = q.monteCarlo({ start: 10000, expectedReturn: 0.07, vol: 0.15, days: 252, sims: 500, seed: 42 });
  assert.deepStrictEqual(a, b);
});

test('monteCarlo percentiles are ordered p5 <= p50 <= p95 and start-anchored', () => {
  const m = q.monteCarlo({ start: 10000, expectedReturn: 0.08, vol: 0.18, days: 252, sims: 800, seed: 7 });
  assert.ok(m.terminal.p5 <= m.terminal.p50, 'p5<=p50');
  assert.ok(m.terminal.p50 <= m.terminal.p95, 'p50<=p95');
  assert.strictEqual(m.start, 10000);
  assert.strictEqual(m.sims, 800);
});

test('monteCarlo with zero vol grows deterministically at the drift rate', () => {
  const m = q.monteCarlo({ start: 1000, expectedReturn: 0.10, vol: 0, days: 252, sims: 10, seed: 1 });
  // sigma=0 → every path identical; terminal ≈ start * e^((mu)*1yr) with the
  // -0.5 sigma^2 term vanishing.
  approx(m.terminal.p50, 1000 * Math.exp(0.10), 1e-2);
  approx(m.terminal.p5, m.terminal.p95, 1e-6);
});

test('monteCarlo guards degenerate input (no NaN/throw)', () => {
  const m = q.monteCarlo({ start: 0, expectedReturn: NaN, vol: -1, days: 0, sims: 0, seed: 0 });
  assert.ok(Number.isFinite(m.terminal.p50));
});

test('mulberry32 same seed → same stream; different seed → different', () => {
  const r1 = q.mulberry32(123); const r2 = q.mulberry32(123); const r3 = q.mulberry32(124);
  const a = r1(); const b = r2();
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, r3());
  assert.ok(a >= 0 && a < 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
