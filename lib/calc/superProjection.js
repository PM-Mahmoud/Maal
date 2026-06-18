'use strict';

// ASFA comfortable retirement lump-sum targets (2024, for age 67, ~20yr horizon at 5% real).
// Single: $595,000 | Couple: $690,000 (updated periodically by ASFA — review annually).
const ASFA_COMFORTABLE_SINGLE = 595000;
const ASFA_COMFORTABLE_COUPLE = 690000;

/**
 * Projects superannuation balance to retirement using AU-specific rules.
 * - Employer SG: 12% of gross salary (current legislated rate from 1 Jul 2025)
 * - Investment returns applied annually after contributions
 * - Does not model tax on contributions (pre-tax contributions taxed at 15% in fund —
 *   included as a simplification by reducing effective return slightly if needed by caller)
 *
 * @param {object} p
 * @param {number} p.currentBalance       Current super balance (AUD)
 * @param {number} p.salary               Annual gross salary (AUD)
 * @param {number} p.age                  Current age (years)
 * @param {number} [p.retirementAge=67]   Target retirement age
 * @param {number} [p.extraAnnual=0]      Extra voluntary contributions per year (AUD, post-tax)
 * @param {number} [p.returnRate=0.07]    Assumed annual net return (default 7% = balanced fund long-run)
 * @param {string} [p.maritalStatus='single'] 'single' | 'couple' — affects ASFA benchmark
 * @returns {{
 *   projectedBalance: number,
 *   asfaTarget: number,
 *   asfaGap: number,
 *   onTrack: boolean,
 *   yearsToRetirement: number,
 *   totalEmployerContributions: number,
 *   totalVoluntaryContributions: number,
 *   yearByYear: Array<{ age: number, balance: number, employerContrib: number, voluntaryContrib: number }>
 * }}
 */
function superProjection({
  currentBalance,
  salary,
  age,
  retirementAge = 67,
  extraAnnual = 0,
  returnRate = 0.07,
  maritalStatus = 'single',
}) {
  if (!isFinite(currentBalance) || currentBalance < 0) throw new Error('currentBalance must be non-negative');
  if (!isFinite(salary) || salary < 0) throw new Error('salary must be non-negative');
  if (!isFinite(age) || age < 15 || age >= 100) throw new Error('age must be between 15 and 99');
  if (!isFinite(retirementAge) || retirementAge <= age) throw new Error('retirementAge must be greater than age');
  if (!isFinite(returnRate) || returnRate < -1) throw new Error('returnRate must be > -1');
  if (!isFinite(extraAnnual) || extraAnnual < 0) throw new Error('extraAnnual must be non-negative');

  const sgRate = 0.12; // Superannuation Guarantee rate (12% from 1 Jul 2025)
  const asfaTarget = maritalStatus === 'couple' ? ASFA_COMFORTABLE_COUPLE : ASFA_COMFORTABLE_SINGLE;
  const yearsToRetirement = retirementAge - age;

  const yearByYear = [];
  let balance = currentBalance;
  let totalEmployer = 0;
  let totalVoluntary = 0;

  for (let y = 0; y < yearsToRetirement; y++) {
    const employerContrib = salary * sgRate;
    const voluntaryContrib = extraAnnual;

    // Contributions added mid-year approximation: half before return, half after
    const midYearBalance = balance + (employerContrib + voluntaryContrib) / 2;
    balance = midYearBalance * (1 + returnRate) + (employerContrib + voluntaryContrib) / 2;

    totalEmployer += employerContrib;
    totalVoluntary += voluntaryContrib;

    yearByYear.push({
      age: age + y + 1,
      balance: Math.round(balance),
      employerContrib: Math.round(employerContrib),
      voluntaryContrib: Math.round(voluntaryContrib),
    });
  }

  const projectedBalance = Math.round(balance);
  const asfaGap = asfaTarget - projectedBalance;

  return {
    projectedBalance,
    asfaTarget,
    asfaGap,
    onTrack: projectedBalance >= asfaTarget,
    yearsToRetirement,
    totalEmployerContributions: Math.round(totalEmployer),
    totalVoluntaryContributions: Math.round(totalVoluntary),
    yearByYear,
  };
}

module.exports = { superProjection, ASFA_COMFORTABLE_SINGLE, ASFA_COMFORTABLE_COUPLE };
