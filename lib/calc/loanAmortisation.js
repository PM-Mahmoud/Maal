'use strict';

/**
 * Loan amortisation schedule (standard reducing-balance, monthly payments).
 * Handles mortgages, personal loans, HECS is income-contingent so excluded.
 *
 * @param {object} p
 * @param {number} p.principal      Loan amount (AUD)
 * @param {number} p.annualRate     Annual interest rate as decimal (e.g. 0.06 = 6%)
 * @param {number} p.termYears      Loan term in years
 * @param {number} [p.extraMonthly=0]  Extra monthly repayment above minimum
 * @returns {{
 *   monthlyPayment: number,
 *   totalInterest: number,
 *   totalPaid: number,
 *   actualTermMonths: number,
 *   interestSavedByExtra: number,
 *   schedule: Array<{ month: number, payment: number, principal: number, interest: number, balance: number }>
 * }}
 */
function loanAmortisation({ principal, annualRate, termYears, extraMonthly = 0 }) {
  if (!isFinite(principal) || principal <= 0) throw new Error('principal must be a positive finite number');
  if (!isFinite(annualRate) || annualRate < 0) throw new Error('annualRate must be non-negative');
  if (!isFinite(termYears) || termYears <= 0) throw new Error('termYears must be positive');
  if (!isFinite(extraMonthly) || extraMonthly < 0) throw new Error('extraMonthly must be non-negative');

  const r = annualRate / 12;
  const n = Math.round(termYears * 12);

  // Standard PMT formula; if rate=0 just divide evenly
  const minPayment = r === 0
    ? principal / n
    : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  const payment = minPayment + extraMonthly;

  // Build schedule
  const schedule = [];
  let balance = principal;
  let totalInterest = 0;
  let month = 0;

  while (balance > 0.005 && month < n * 2) { // guard against infinite loop
    month++;
    const interestCharge = balance * r;
    const principalCharge = Math.min(payment - interestCharge, balance);
    balance = Math.max(0, balance - principalCharge);
    totalInterest += interestCharge;

    schedule.push({
      month,
      payment: Math.round((principalCharge + interestCharge) * 100) / 100,
      principal: Math.round(principalCharge * 100) / 100,
      interest: Math.round(interestCharge * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    });
  }

  // Calculate baseline total interest (no extra) for savings comparison
  let baselineInterest = 0;
  if (extraMonthly > 0) {
    let b2 = principal;
    for (let i = 0; i < n; i++) {
      const ic = b2 * r;
      b2 = Math.max(0, b2 - (minPayment - ic));
      baselineInterest += ic;
    }
  } else {
    baselineInterest = totalInterest;
  }

  return {
    monthlyPayment: Math.round(minPayment * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPaid: Math.round((principal + totalInterest) * 100) / 100,
    actualTermMonths: month,
    interestSavedByExtra: Math.round((baselineInterest - totalInterest) * 100) / 100,
    schedule,
  };
}

module.exports = { loanAmortisation };
