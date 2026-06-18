'use strict';

/**
 * Deterministic compound growth calculator.
 * LLM must never call this to compute numbers inline — always call this
 * function and pass the results into the prompt for the model to narrate.
 *
 * @param {object} p
 * @param {number} p.principal        Starting balance (AUD)
 * @param {number} p.annualRate       Annual return rate as decimal (e.g. 0.07 = 7%)
 * @param {number} p.years            Projection horizon in years
 * @param {number} [p.monthlyContribution=0]  Regular monthly addition (AUD)
 * @returns {{
 *   finalValue: number,
 *   totalContributed: number,
 *   totalGrowth: number,
 *   effectiveAnnualRate: number,
 *   yearByYear: Array<{ year: number, balance: number, contributed: number, growth: number }>
 * }}
 */
function compoundGrowth({ principal, annualRate, years, monthlyContribution = 0 }) {
  if (!isFinite(principal) || principal < 0) throw new Error('principal must be a non-negative finite number');
  if (!isFinite(annualRate) || annualRate < -1) throw new Error('annualRate must be > -1');
  if (!isFinite(years) || years <= 0 || !Number.isInteger(years)) throw new Error('years must be a positive integer');
  if (!isFinite(monthlyContribution) || monthlyContribution < 0) throw new Error('monthlyContribution must be non-negative');

  const monthlyRate = annualRate / 12;
  const yearByYear = [];
  let balance = principal;
  let totalContributed = principal;

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
    }
    totalContributed += monthlyContribution * 12;
    yearByYear.push({
      year: y,
      balance: Math.round(balance),
      contributed: Math.round(totalContributed),
      growth: Math.round(balance - totalContributed),
    });
  }

  const finalValue = Math.round(balance);
  const totalGrowth = Math.round(balance - totalContributed);

  return {
    finalValue,
    totalContributed: Math.round(totalContributed),
    totalGrowth,
    effectiveAnnualRate: annualRate,
    yearByYear,
  };
}

module.exports = { compoundGrowth };
