// lib/maal-score.js
// ─────────────────────────────────────────────────────────────────────────────
// The Maal Score — a single 0–100 financial wellbeing score.
//
// Methodology: a weighted composite of five pillars, modelled on the research
// behind the US CFPB Financial Well-Being Scale and the Financial Health
// Network's FinHealth Score, adapted for Australia (superannuation benchmarks,
// HECS-HELP's income-contingent nature, Medicare/private health).
//
//   Pillar               Weight  What it measures
//   1. Savings buffer      25%   Months of expenses covered by liquid assets
//   2. Debt health         25%   Debt-to-income, with HECS discounted (income-
//                                contingent, CPI-indexed — not commercial debt)
//   3. Super adequacy      20%   Balance vs. age-based benchmark (ASFA-style)
//   4. Wealth trajectory   15%   Net worth as a multiple of income vs. age peers
//   5. Protection          15%   Insurance cover, retirement planning, health cover
//
// Each pillar scores 0–100; the Maal Score is the weighted sum, so the score
// itself is directly explainable: "your buffer is thin" or "super is ahead".
//
// Bands: 80+ Excellent · 65–79 Strong · 50–64 Steady · 35–49 Stretched · <35 At Risk
// ─────────────────────────────────────────────────────────────────────────────

const { superProjection } = require('./calc');

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * @param {object} profile  user_profiles row (may be null)
 * @returns {object} { score, band, pillars[], hasData }
 */
function computeMaalScore(profile) {
  const p = profile || {};
  const income      = Number(p.annual_income) || 0;
  const superBal    = Number(p.super_balance) || 0;
  const investBal   = Number(p.investment_portfolio) || 0;
  const propertyVal = Number(p.property_value) || 0;
  const hecs        = Number(p.hecs_balance) || 0;
  const otherDebt   = Number(p.total_debt) || 0;
  const cashBal     = Number(p.cash_savings) || 0;
  const statedExp   = Number(p.monthly_expenses) || 0;

  // Age: prefer the band the user actually chose. Callers pass either the
  // normalised profile (which has a numeric `age`) or the raw user_profiles row
  // (where the React flow stores `age_band` inside onboarding_data), so handle
  // both. years_in_practice is a legacy EJS field the React flow never writes,
  // so relying on it alone scored every modern user as 25 and distorted the
  // super and wealth-trajectory pillars. Band midpoints mirror deriveAge() in
  // db/profiles.js.
  const AGE_BAND_MIDPOINTS = { 'under-30': 27, '30-39': 35, '40-49': 45, '50-59': 55, '60+': 65 };
  const od = (p.onboarding_data && typeof p.onboarding_data === 'object') ? p.onboarding_data : {};
  const bandAge = AGE_BAND_MIDPOINTS[od.age_band] || 0;
  const statedAge = Number(p.age) || bandAge || 0;
  const yearsIn = Number(p.years_in_practice) || 0;
  const age = statedAge > 0 ? clamp(statedAge, 18, 100) : clamp(25 + yearsIn, 22, 75);

  const hasData = income > 0 || superBal > 0 || investBal > 0 || hecs > 0 || otherDebt > 0 || cashBal > 0;

  // ── 1. Savings buffer (25%) ────────────────────────────────────────────────
  // Liquid assets vs. monthly expenses. 6+ months of buffer = full marks.
  // Use what the user actually told us when we have it: real cash on hand is a
  // truer emergency buffer than the investment balance, and their stated
  // monthly spend beats the ABS heuristic (≈55% of gross income / 12), which is
  // only a fallback now. Previously neither field was read at all, so entering
  // cash or expenses could not move the score.
  const monthlyExpenses = statedExp > 0 ? statedExp : (income > 0 ? (income * 0.55) / 12 : 3500);
  const liquidAssets = cashBal > 0 ? cashBal : investBal;
  const bufferMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0;
  const savingsScore = clamp((bufferMonths / 6) * 100, 0, 100);

  // ── 2. Debt health (25%) ──────────────────────────────────────────────────
  // Effective DTI: commercial debt counts fully, HECS at 30% weight.
  // DTI 0 → 100 pts, DTI ≥ 1.5× income → 0 pts (linear between).
  const effectiveDebt = otherDebt + 0.3 * hecs;
  const dti = income > 0 ? effectiveDebt / income : (effectiveDebt > 0 ? 1.5 : 0);
  const debtScore = clamp(100 - (dti / 1.5) * 100, 0, 100);

  // ── 3. Super adequacy (20%) ───────────────────────────────────────────────
  // Use superProjection to compute projected balance at retirement, then
  // score against the ASFA comfortable target (single/couple). Score 100 if
  // on track, scales linearly down to 0 at 0% of target.
  let superScore = 0;
  let superTarget = 595000; // ASFA comfortable single (fallback)
  if (income > 0 && age < 67) {
    try {
      const proj = superProjection({ currentBalance: superBal, salary: income, age, retirementAge: Number(p.retirement_age) || 67 });
      superTarget = proj.asfaTarget;
      superScore = clamp((proj.projectedBalance / proj.asfaTarget) * 100, 0, 100);
    } catch (_e) {
      // fallback: current balance vs simple age benchmark
      const ratio = superBal / Math.max(superTarget, 1);
      superScore = clamp(ratio * 100, 0, 100);
    }
  }

  // ── 4. Wealth trajectory (15%) ────────────────────────────────────────────
  // Net worth (incl. property, net of all debt) as a multiple of income,
  // vs. a modest age benchmark: (age − 25) × 0.45 × income.
  const netWorth = superBal + investBal + propertyVal - hecs - otherDebt;
  const nwTargetMult = Math.max(0.25, (age - 25) * 0.45);
  const nwTarget = income > 0 ? income * nwTargetMult : 100000;
  const wealthScore = clamp((netWorth / nwTarget) * 100, 0, 100);

  // ── 5. Protection & planning (15%) ────────────────────────────────────────
  let protection = 0;
  const cover = (p.insurance_cover || 'none').toLowerCase();
  if (cover === 'full' || cover === 'comprehensive') protection += 50;
  else if (cover !== 'none') protection += 25;
  if (p.has_private_health) protection += 20;
  if (p.retirement_age) protection += 15;
  if (p.completed_onboarding) protection += 15;
  const protectionScore = clamp(protection, 0, 100);

  // ── Composite ─────────────────────────────────────────────────────────────
  const pillars = [
    { key: 'savings',    label: 'Savings buffer',    score: Math.round(savingsScore),    weight: 0.25, note: bufferMonths >= 6 ? '6+ months of expenses covered' : bufferMonths >= 1 ? Math.round(bufferMonths * 10) / 10 + ' months of expenses covered' : 'Less than 1 month of buffer' },
    { key: 'debt',       label: 'Debt health',       score: Math.round(debtScore),       weight: 0.25, note: dti <= 0.05 ? 'Effectively debt-free' : 'Debt is ' + Math.round(dti * 100) + '% of income (HECS discounted)' },
    { key: 'super',      label: 'Super adequacy',    score: Math.round(superScore),      weight: 0.20, note: superScore >= 100 ? 'On track for ASFA comfortable retirement' : 'Projected gap to ASFA target: ~$' + Math.round(Math.max(0, superTarget - (superBal || 0)) / 1000) + 'k' },
    { key: 'wealth',     label: 'Wealth trajectory', score: Math.round(wealthScore),     weight: 0.15, note: 'Net worth vs. age-peer benchmark' },
    { key: 'protection', label: 'Protection',        score: Math.round(protectionScore), weight: 0.15, note: protectionScore >= 70 ? 'Well protected' : 'Insurance / planning gaps to close' },
  ];

  const score = Math.round(pillars.reduce((sum, pl) => sum + pl.score * pl.weight, 0));
  const band = score >= 80 ? 'Excellent'
             : score >= 65 ? 'Strong'
             : score >= 50 ? 'Steady'
             : score >= 35 ? 'Stretched'
             : 'At Risk';

  return { score, band, pillars, hasData };
}

module.exports = { computeMaalScore };
