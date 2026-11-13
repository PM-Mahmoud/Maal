'use strict';
// lib/quick-score.js — the free /score calculator, server side.
//
// MIRRORS the client calculator in views/score.ejs (computeScore + the
// helping / holding-back / next-steps copy). The server recomputes from the
// raw answers before emailing anyone their score, so the emailed number can't
// be spoofed by a crafted request. If you change the formula or copy, change
// both places — test/quick-score.test.js pins the numbers.

const ASFA_BENCHMARKS = { 25: 50000, 30: 100000, 35: 175000, 40: 275000, 45: 400000, 50: 550000, 55: 720000, 60: 950000 };
const PROTECTION_ESTIMATE = 55; // no insurance questions yet → fixed estimate

const PILLAR_META = [
  { key: 'savings', label: 'Savings & Net Worth', weight: 25 },
  { key: 'debt', label: 'Debt Management', weight: 25 },
  { key: 'super', label: 'Superannuation', weight: 20 },
  { key: 'trajectory', label: 'Wealth Trajectory', weight: 15 },
  { key: 'protection', label: 'Protection & Insurance', weight: 15 },
];

const HELPING_COPY = {
  savings: 'ahead of where your age and income would suggest',
  debt: 'well managed relative to what you own',
  super: 'tracking well against the ASFA benchmark for your age',
  trajectory: 'growing faster than your income alone would suggest',
};
const DRAGGING_COPY = {
  savings: 'behind where your age and income would suggest',
  debt: 'a large share of what you own',
  super: 'behind the ASFA benchmark for your age',
  trajectory: 'not yet keeping pace with your income',
};
const NEXT_STEP_COPY = {
  savings: 'How building a cash buffer changes your net worth over time.',
  debt: 'Whether paying down debt faster, or investing the difference, gets you further.',
  super: 'Whether extra super contributions could close the gap to the ASFA benchmark for your age.',
  trajectory: 'How consistent investing compounds over the next 10, 20, 30 years.',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Money answers: finite, non-negative, capped at $1B so nonsense can't blow up.
function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1e9) : 0;
}

function sanitiseInputs(raw) {
  const r = raw || {};
  const age = Number(r.age);
  return {
    age: Number.isFinite(age) && age > 0 ? clamp(Math.round(age), 16, 100) : 35,
    income: money(r.income),
    assets: money(r.assets),
    debts: money(r.debts),
    superBalance: money(r.superBalance),
  };
}

function scoreBand(v) {
  if (v >= 80) return 'Excellent';
  if (v >= 65) return 'Good';
  if (v >= 50) return 'Fair';
  if (v >= 35) return 'Needs Work';
  return 'At Risk';
}

function computeQuickScore(raw) {
  const inp = sanitiseInputs(raw);
  const { age, income, assets, debts, superBalance } = inp;
  const netWorth = assets - debts;

  const savingsTarget = income * (age / 5);
  const savings = Math.max(0, savingsTarget > 0 ? Math.min(100, (netWorth / savingsTarget) * 100) : 50);

  const debtRatio = assets > 0 ? debts / assets : 1;
  const debt = Math.max(0, Math.min(100, (1 - debtRatio) * 100));

  let benchmark = 0;
  Object.keys(ASFA_BENCHMARKS).map(Number).sort((a, b) => a - b)
    .forEach((a) => { if (age >= a) benchmark = ASFA_BENCHMARKS[a]; });
  if (!benchmark) benchmark = 50000;
  const sup = Math.max(0, Math.min(100, (superBalance / benchmark) * 100));

  const trajectory = Math.max(0, income > 0 ? Math.min(100, (assets / (income * 3)) * 100) : 50);

  const raws = { savings, debt, super: sup, trajectory, protection: PROTECTION_ESTIMATE };
  const total = Math.round(savings * 0.25 + debt * 0.25 + sup * 0.20 + trajectory * 0.15 + PROTECTION_ESTIMATE * 0.15);
  const pillars = PILLAR_META.map((p) => ({ ...p, score: Math.round(raws[p.key]) }));

  // Narrative excludes Protection (fixed estimate, not based on their answers).
  const real = pillars.filter((p) => p.key !== 'protection');
  const asc = real.slice().sort((a, b) => a.score - b.score);
  const desc = real.slice().sort((a, b) => b.score - a.score);
  let helping = desc.filter((p) => p.score >= 60).slice(0, 2);
  if (!helping.length) helping = [desc[0]];
  const dragging = asc.filter((p) => p.score < 70).slice(0, 2);

  return {
    inputs: inp,
    total,
    band: scoreBand(total),
    netWorth,
    pillars,
    helping: helping.map((p) => `${p.label} is ${HELPING_COPY[p.key]}.`),
    holdingBack: dragging.map((p) => `${p.label} is ${DRAGGING_COPY[p.key]}.`),
    nextSteps: asc.slice(0, 3).map((p) => NEXT_STEP_COPY[p.key]),
  };
}

module.exports = { computeQuickScore, sanitiseInputs, scoreBand, ASFA_BENCHMARKS };
