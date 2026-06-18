'use strict';

const { ASFA_COMFORTABLE_SINGLE, ASFA_COMFORTABLE_COUPLE } = require('./superProjection');

/**
 * Monte Carlo retirement simulation using log-normal annual returns.
 * Runs N independent paths, each with a randomly drawn annual return, and
 * reports outcome percentiles + success rate against the ASFA comfortable target.
 *
 * @param {object} p
 * @param {number} p.currentBalance       Current super/investment balance (AUD)
 * @param {number} p.salary               Annual gross salary (AUD)
 * @param {number} p.age                  Current age
 * @param {number} [p.retirementAge=67]
 * @param {number} [p.extraAnnual=0]      Extra voluntary super contributions per year
 * @param {number} [p.returnMean=0.07]    Mean annual return (arithmetic)
 * @param {number} [p.returnStdDev=0.12]  Std dev of annual returns (12% ≈ balanced fund historical)
 * @param {number} [p.simulations=1000]   Number of paths
 * @param {string} [p.maritalStatus='single']
 * @param {number|null} [p.seed=null]     PRNG seed for reproducibility
 * @returns {{
 *   p10: number, p25: number, p50: number, p75: number, p90: number,
 *   successRate: number,
 *   asfaTarget: number,
 *   meanOutcome: number,
 *   simulations: number,
 *   paths: number[]
 * }}
 */
function monteCarlo({
  currentBalance,
  salary,
  age,
  retirementAge = 67,
  extraAnnual = 0,
  returnMean = 0.07,
  returnStdDev = 0.12,
  simulations = 1000,
  maritalStatus = 'single',
  seed = null,
}) {
  if (!isFinite(currentBalance) || currentBalance < 0) throw new Error('currentBalance must be non-negative');
  if (!isFinite(salary) || salary < 0) throw new Error('salary must be non-negative');
  if (!isFinite(age) || age < 15 || age >= 100) throw new Error('age must be between 15 and 99');
  if (!isFinite(retirementAge) || retirementAge <= age) throw new Error('retirementAge must be > age');
  if (simulations < 10 || simulations > 100000) throw new Error('simulations must be between 10 and 100000');

  // Log-normal parameters so E[annualReturn] = returnMean
  const sigma = Math.sqrt(Math.log(1 + (returnStdDev ** 2) / ((1 + returnMean) ** 2)));
  const mu = Math.log(1 + returnMean) - sigma ** 2 / 2;

  const sgRate = 0.12;
  const yearsToRetirement = retirementAge - age;
  const target = maritalStatus === 'couple' ? ASFA_COMFORTABLE_COUPLE : ASFA_COMFORTABLE_SINGLE;

  // Seeded PRNG (mulberry32) for reproducibility
  let rand;
  if (seed !== null) {
    let s = seed >>> 0;
    rand = () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  } else {
    rand = Math.random;
  }

  // Box-Muller transform → standard normal sample
  function randn() {
    const u1 = Math.max(rand(), 1e-10);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const finalBalances = [];

  for (let sim = 0; sim < simulations; sim++) {
    let balance = currentBalance;
    for (let y = 0; y < yearsToRetirement; y++) {
      const annualReturn = Math.exp(mu + sigma * randn()) - 1;
      const contrib = salary * sgRate + extraAnnual;
      // Mid-year contribution approximation
      balance = (balance + contrib / 2) * (1 + annualReturn) + contrib / 2;
      if (balance < 0) balance = 0;
    }
    finalBalances.push(Math.round(balance));
  }

  finalBalances.sort((a, b) => a - b);

  const percentile = (pct) => finalBalances[Math.round((pct / 100) * (simulations - 1))];
  const successCount = finalBalances.filter((b) => b >= target).length;
  const meanOutcome = Math.round(finalBalances.reduce((s, v) => s + v, 0) / simulations);

  return {
    p10: percentile(10),
    p25: percentile(25),
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    successRate: Math.round((successCount / simulations) * 100),
    asfaTarget: target,
    meanOutcome,
    simulations,
    paths: finalBalances,
  };
}

module.exports = { monteCarlo };
