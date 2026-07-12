// lib/tax.js
// Indicative Australian resident income-tax estimate for the Tax Impact widget.
// All rates/thresholds come from lib/au-constants.js (FY-keyed, single source
// of truth) — brackets + 2% Medicare levy + marginal HECS repayment.
// Educational estimate only — ignores offsets (LITO), deductions, salary
// packaging and Medicare levy surcharge.

const { getConstants } = require('./au-constants');

function incomeTax(income, brackets) {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

// Marginal HECS system (from 1 July 2025): nothing below the threshold, then
// band rates on income above each boundary; 10% of total once far enough above.
function hecsRepayment(income, hecsBalance, h) {
  if (!hecsBalance || hecsBalance <= 0 || income <= h.minThreshold) return 0;
  let repayment;
  if (income > h.tenPercentAbove) {
    repayment = income * 0.10;
  } else {
    repayment =
      Math.max(0, Math.min(income, h.band1To) - h.minThreshold) * h.band1Rate +
      Math.max(0, income - h.band1To) * h.band2Rate;
  }
  return Math.min(repayment, hecsBalance);
}

function estimateTax(profile) {
  const c = getConstants();
  const income = Number(profile && profile.annual_income) || 0;
  const hecsBalance = Number(profile && profile.hecs_balance) || 0;
  if (income <= 0) return { hasData: false };

  const base = incomeTax(income, c.incomeTaxBrackets);
  const medicare = income > c.medicare.lowIncomeThresholdSingle ? income * c.medicare.levyRate : 0;
  const hecs = hecsRepayment(income, hecsBalance, c.hecs);
  const total = base + medicare + hecs;

  return {
    hasData: true,
    income,
    incomeTax: Math.round(base),
    medicare: Math.round(medicare),
    hecs: Math.round(hecs),
    total: Math.round(total),
    takeHome: Math.round(income - total),
    takeHomeMonthly: Math.round((income - total) / 12),
    effectiveRate: Math.round((total / income) * 1000) / 10,
    marginalRate: Math.round((c.incomeTaxBrackets.find(b => income <= b.upTo).rate * 100 + c.medicare.levyRate * 100)),
  };
}

module.exports = { estimateTax };
