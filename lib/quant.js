// lib/quant.js — PURE portfolio quant for the deep-research pipeline (PR 8).
//
// No I/O, no dates, no randomness except a SEEDED generator so Monte-Carlo is
// reproducible and can be covered by deterministic tests (financial-calculation
// rule in CLAUDE.md). Everything degrades to 0/null on short or malformed input —
// never NaN, never throws.
//
// Conventions:
//   - "returns" are simple period returns (r_t = P_t / P_{t-1} - 1).
//   - Annualisation uses 252 trading days by default.

const TRADING_DAYS = 252;

function nums(arr) {
  return (Array.isArray(arr) ? arr : []).map(Number).filter((n) => Number.isFinite(n));
}
function round(n, dp = 6) {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, dp);
  return Math.round((n + Number.EPSILON) * f) / f;
}

// Simple daily returns from a price series (oldest → newest).
function dailyReturns(prices) {
  const p = nums(prices);
  const out = [];
  for (let i = 1; i < p.length; i++) {
    if (p[i - 1] === 0) continue;
    out.push(p[i] / p[i - 1] - 1);
  }
  return out;
}

function mean(arr) {
  const a = nums(arr);
  if (!a.length) return 0;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

// Sample variance (n-1). Population would divide by n; sample is standard for
// return series and matches how vol is usually quoted.
function variance(arr) {
  const a = nums(arr);
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
}

function stdev(arr) {
  return Math.sqrt(variance(arr));
}

// Sample covariance of two equal-length series (truncates to the shorter).
function covariance(a, b) {
  const x = nums(a);
  const y = nums(b);
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (n - 1);
}

// Beta of an asset vs the market = cov(asset, market) / var(market).
function beta(assetReturns, marketReturns) {
  const v = variance(marketReturns);
  if (v === 0) return 0;
  return round(covariance(assetReturns, marketReturns) / v, 4);
}

// Annualised volatility = stdev(daily returns) * sqrt(periods/yr).
function annualizedVol(returns, periodsPerYear = TRADING_DAYS) {
  return round(stdev(returns) * Math.sqrt(periodsPerYear), 6);
}

// CAGR from a price series over its span, annualised by trading-day count.
function annualizedReturn(prices, periodsPerYear = TRADING_DAYS) {
  const p = nums(prices);
  if (p.length < 2 || p[0] <= 0) return 0;
  const periods = p.length - 1;
  const total = p[p.length - 1] / p[0];
  if (total <= 0) return 0;
  return round(Math.pow(total, periodsPerYear / periods) - 1, 6);
}

// Maximum drawdown: worst peak-to-trough decline as a NEGATIVE fraction
// (e.g. -0.35 = a 35% fall). 0 if the series never falls.
function maxDrawdown(prices) {
  const p = nums(prices);
  if (p.length < 2) return 0;
  let peak = p[0];
  let worst = 0;
  for (const v of p) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < worst) worst = dd;
    }
  }
  return round(worst, 6);
}

// Historical Value at Risk at `confidence` (default 95%): the loss NOT exceeded
// with that probability over one period, as a POSITIVE magnitude. Uses the
// empirical quantile of the return distribution.
function historicalVaR(returns, confidence = 0.95) {
  const r = nums(returns).slice().sort((a, b) => a - b);
  if (!r.length) return 0;
  const q = Math.min(Math.max(1 - confidence, 0), 1);
  const idx = Math.floor(q * r.length);
  const worst = r[Math.min(idx, r.length - 1)];
  return round(worst < 0 ? -worst : 0, 6);
}

// mulberry32 — tiny, fast, well-distributed seeded PRNG. Deterministic for a
// given seed, so Monte-Carlo output is reproducible in tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller, driven by a seeded uniform generator.
function gaussian(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Monte-Carlo terminal-value simulation of a single position under geometric
// Brownian motion, using daily mu/sigma derived from annual inputs.
//   { start, expectedReturn (annual), vol (annual), days, sims, seed }
// Returns terminal-value percentiles + the annualised-return percentiles.
function monteCarlo({ start = 10000, expectedReturn = 0.07, vol = 0.15, days = 252, sims = 1000, seed = 12345 } = {}) {
  start = Number(start) || 0;
  days = Math.max(1, Math.floor(days));
  sims = Math.max(1, Math.floor(sims));
  const mu = Number(expectedReturn) || 0;
  const sigma = Math.max(0, Number(vol) || 0);
  const dt = 1 / TRADING_DAYS;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const diff = sigma * Math.sqrt(dt);
  const rand = mulberry32(seed);

  const terminals = new Array(sims);
  for (let s = 0; s < sims; s++) {
    let v = start;
    for (let d = 0; d < days; d++) {
      v *= Math.exp(drift + diff * gaussian(rand));
    }
    terminals[s] = v;
  }
  terminals.sort((a, b) => a - b);

  const pct = (q) => terminals[Math.min(terminals.length - 1, Math.max(0, Math.floor(q * terminals.length)))];
  const years = days / TRADING_DAYS;
  const asReturn = (val) => (start > 0 && years > 0 ? Math.pow(val / start, 1 / years) - 1 : 0);

  return {
    start: round(start, 2),
    days,
    sims,
    terminal: {
      p5: round(pct(0.05), 2),
      p25: round(pct(0.25), 2),
      p50: round(pct(0.5), 2),
      p75: round(pct(0.75), 2),
      p95: round(pct(0.95), 2),
      mean: round(mean(terminals), 2),
    },
    annualizedReturn: {
      p5: round(asReturn(pct(0.05)), 6),
      p50: round(asReturn(pct(0.5)), 6),
      p95: round(asReturn(pct(0.95)), 6),
    },
  };
}

module.exports = {
  TRADING_DAYS,
  dailyReturns, mean, variance, stdev, covariance,
  beta, annualizedVol, annualizedReturn, maxDrawdown, historicalVaR,
  mulberry32, monteCarlo, round,
};
