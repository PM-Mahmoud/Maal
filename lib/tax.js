// lib/tax.js
// Indicative Australian resident income-tax estimate for the Tax Impact widget.
// 2025-26 rates: stage-3 brackets + 2% Medicare levy + new marginal HECS
// repayment system (from 1 July 2025). Educational estimate only — ignores
// offsets (LITO), deductions, salary packaging and Medicare levy surcharge.

const BRACKETS = [
  { upTo: 18200, rate: 0 },
  { upTo: 45000, rate: 0.16 },
  { upTo: 135000, rate: 0.30 },
  { upTo: 190000, rate: 0.37 },
  { upTo: Infinity, rate: 0.45 },
];

function incomeTax(income) {
  let tax = 0;
  let lower = 0;
  for (const b of BRACKETS) {
    if (income <= lower) break;
    tax += (Math.min(income, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

// New marginal HECS system: nothing below $67,000, then 15c per dollar
// between $67,000–$125,000 and 17c per dollar above $125,000.
function hecsRepayment(income, hecsBalance) {
  if (!hecsBalance || hecsBalance <= 0 || income <= 67000) return 0;
  const band1 = Math.max(0, Math.min(income, 125000) - 67000) * 0.15;
  const band2 = Math.max(0, income - 125000) * 0.17;
  return Math.min(band1 + band2, hecsBalance);
}

function estimateTax(profile) {
  const income = Number(profile && profile.annual_income) || 0;
  const hecsBalance = Number(profile && profile.hecs_balance) || 0;
  if (income <= 0) return { hasData: false };

  const base = incomeTax(income);
  const medicare = income > 26000 ? income * 0.02 : 0; // approx low-income threshold
  const hecs = hecsRepayment(income, hecsBalance);
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
    marginalRate: Math.round((BRACKETS.find(b => income <= b.upTo).rate * 100 + 2)),
  };
}

module.exports = { estimateTax };
