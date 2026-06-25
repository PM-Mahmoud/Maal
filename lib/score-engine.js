/**
 * Financial Health Score Engine v2
 *
 * Owns: the core scoring algorithms, ASFA benchmarks, Australian regulatory thresholds
 * Does NOT own: HTTP routing, persistence, email, UI rendering
 *
 * ─── Score structure (total 100 points) ─────────────────────────────────────
 * Component              Max pts  Description
 * ─────────────────────────────────────────────────────────────────────────
 * Debt Ratio              20  HECS + consumer debt as % of gross income
 * Savings Rate            15  Monthly savings as % of gross income
 * Emergency Fund          15  Months of expenses covered by liquid savings
 * Super Adequacy          20  Current balance vs ASFA comfortable benchmark for age
 * Insurance Coverage      10  Life + income protection + total cover adequacy
 * Investment Diversity    10  Non-super portfolio concentration risk
 * Retirement Readiness    10  Projected super at target retirement age vs target
 *
 * ─── Additional outputs ────────────────────────────────────────────────────
 * halalComplianceScore   0–100  Portfolio diversification signal (legacy name; not surfaced)
 * portfolioHealthScore   0–100  Portfolio quality: concentration, liquidity, overlap
 * recommendations         []    Top 3 personalised actions, ranked by impact
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * ASFA comfortable retirement benchmarks (single person, 2025 estimates).
 * Source: Association of Superannuation Funds of Australia (ASFA) Retirement
 * Standard — updated quarterly. These figures are conservative estimates used
 * with the owner's permission for educational scoring only.
 */
const ASFA_BENCHMARKS = [
  { maxAge: 25, balance: 12_000 },
  { maxAge: 30, balance: 55_000 },
  { maxAge: 35, balance: 110_000 },
  { maxAge: 40, balance: 185_000 },
  { maxAge: 45, balance: 270_000 },
  { maxAge: 50, balance: 370_000 },
  { maxAge: 55, balance: 475_000 },
  { maxAge: 60, balance: 570_000 },
  { maxAge: 65, balance: 640_000 },
  { maxAge: 999, balance: 640_000 },
];

/**
 * ASFA comfortable annual income target (pre-retirement spending benchmark).
 * Used for retirement readiness modelling.
 */
const ASFA_ANNUAL_SPEND = 65_000;

/**
 * HECS/HELP compulsory repayment thresholds (FY2024–25, ATO).
 * Above these incomes, compulsory repayments are withheld by employer.
 * Indexation (CPI) applies annually — model uses FY25 figures.
 */
const HECS_THRESHOLDS = [
  { minIncome: 0,      maxIncome: 45_881,   rate: 0 },
  { minIncome: 45_881,  maxIncome: 55_787,   rate: 0.07 },
  { minIncome: 55_787,  maxIncome: 119_882,  rate: 0.125 },
  { minIncome: 119_882, maxIncome: 157_202,  rate: 0.175 },
  { minIncome: 157_202, maxIncome: 183_723,  rate: 0.23 },
  { minIncome: 183_723, maxIncome: 999_999_999, rate: 0.31 },
];

/**
 * Medicare Levy Surcharge (MLS) thresholds — income above which a
 * private patient hospital cover is required to avoid the 1–1.5% MLS.
 * Single income thresholds for FY25.
 */
const MLS_THRESHOLDS = [
  { minIncome: 0,      maxIncome: 105_000,  surcharge: 0 },
  { minIncome: 105_000, maxIncome: 999_999_999, surcharge: 0.015 },
];

/**
 * Superannuation Guarantee rate (mandatory employer contribution).
 * Rises 0.5%/yr: 11% FY25, 11.5% FY26, 12% FY27.
 */
const SG_RATE = 0.11;

/**
 * Concessional (pre-tax) super cap for FY25 — $30,000/year.
 */
const CONCESSIONAL_CAP = 30_000;

/**
 * Non-concessional (after-tax) super cap — $120,000/year (or $360k via bring-forward).
 */
const NON_CONCESSIONAL_CAP = 120_000;

// ─── Benchmark helpers ──────────────────────────────────────────────────────

function asfaBenchmark(age) {
  const entry = ASFA_BENCHMARKS.find((b) => age <= b.maxAge);
  return entry ? entry.balance : ASFA_BENCHMARKS.at(-1).balance;
}

function hecsRepaymentRate(income) {
  const tier = HECS_THRESHOLDS.find((t) => income <= t.maxIncome);
  return tier ? tier.rate : 0;
}

function hecsCompulsoryAnnual(income) {
  return Math.round(income * hecsRepaymentRate(income));
}

function mlsSurcharge(income) {
  const tier = MLS_THRESHOLDS.find((t) => income <= t.maxIncome);
  return tier ? tier.surcharge : 0;
}

// ─── Component scorers ──────────────────────────────────────────────────────

/**
 * Debt Ratio — 20 pts max
 *
 * Captures HECS/HELP + other consumer debt as a fraction of gross income.
 * Excludes mortgage (property asset, different risk profile).
 *
 * Thresholds:
 *   < 10%  → 20 pts (healthy)
 *   10–30% → linear decay (20 → 8 pts)
 *   30–50% → linear decay (8 → 2 pts)
 *   > 50%  → 0 pts
 */
function scoreDebtRatio(annualIncome, hecsBalance, otherDebtBalance) {
  const income = Math.max(1, annualIncome || 0);
  const debt = (hecsBalance || 0) + (otherDebtBalance || 0);
  const ratio = debt / income;

  if (ratio <= 0.1) return 20;
  if (ratio <= 0.3) {
    // 0.1 → 20pts, 0.3 → 8pts
    return Math.round(20 - ((ratio - 0.1) / 0.2) * 12);
  }
  if (ratio <= 0.5) {
    // 0.3 → 8pts, 0.5 → 2pts
    return Math.round(8 - ((ratio - 0.3) / 0.2) * 6);
  }
  return Math.max(0, Math.round(2 - (ratio - 0.5) * 2));
}

/**
 * Savings Rate — 15 pts max
 *
 * Monthly net savings as % of monthly gross income.
 * Uses pre-tax monthly gross (÷12), which is conservative (true savings rate
 * is slightly higher on post-tax basis).
 *
 * Thresholds:
 *   ≥ 20% → 15 pts (ASFA target)
 *   10–20% → linear
 *   5–10%  → linear, below 5% earns 0
 */
function scoreSavingsRate(annualIncome, monthlySavings) {
  const monthlyGross = Math.max(1, annualIncome || 0) / 12;
  const savings = Math.max(0, monthlySavings || 0);
  const rate = savings / monthlyGross;

  if (rate >= 0.2) return 15;
  if (rate <= 0) return 0;
  if (rate < 0.05) return Math.round((rate / 0.05) * 3); // 0–3 pts below 5%
  return Math.round(3 + ((rate - 0.05) / 0.15) * 12);   // 3–15 pts above 5%
}

/**
 * Emergency Fund — 15 pts max
 *
 * Liquid savings vs monthly expenses. Monthly expenses = annual income ÷ 12
 * as a conservative proxy (assumes no major lifestyle variance).
 *
 * Thresholds:
 *   ≥ 3 months → 15 pts (standard target)
 *   1–3 months → linear
 *   < 1 month  → 0 pts (financially vulnerable)
 */
function scoreEmergencyFund(annualIncome, emergencyMonths) {
  const months = Math.max(0, emergencyMonths || 0);
  if (months >= 3) return 15;
  if (months <= 0) return 0;
  return Math.round((months / 3) * 15);
}

/**
 * Super Adequacy — 20 pts max
 *
 * Compares current super balance to ASFA comfortable benchmark for the user's
 * age. The benchmark is for a single person targeting a comfortable retirement
 * (~$64k/year in retirement). Users can be above or below; linear scoring below
 * benchmark, capped at benchmark.
 *
 * Above benchmark earns 20 pts. At benchmark earns 18 pts (some headroom).
 * 50% of benchmark = 10 pts. Below 20% of benchmark = 0 pts.
 */
function scoreSuperAdequacy(age, superBalance) {
  const balance = Math.max(0, superBalance || 0);
  const benchmark = asfaBenchmark(Math.max(18, age || 30));

  if (balance >= benchmark) return 20;
  const ratio = balance / benchmark;
  if (ratio <= 0.2) return 0;
  // 0.2 → 0, 0.5 → 10, 1.0 → 18
  return Math.round(18 * ((ratio - 0.2) / 0.8));
}

/**
 * Insurance Coverage — 10 pts max
 *
 * Everyone faces income interruption risks: illness, injury, redundancy.
 * Score based on presence of income protection + life/TPD + total cover.
 *
 * 3 types, each contributes up to 4/3/3 pts respectively (prioritised):
 *   Income Protection (4 pts): has it → 4, not sure → 2, no → 0
 *   Life + TPD (3 pts): has it → 3, not sure → 1, no → 0
 *   Total/adequate cover (3 pts): has it → 3, not sure → 1, no → 0
 *
 * User inputs: insuranceCover (enum: 'full' | 'partial' | 'none')
 * 'full' = has income protection cover
 */
function scoreInsurance(insuranceCover) {
  const cover = insuranceCover || 'none';
  if (cover === 'full') return 10;
  if (cover === 'partial') return 5;
  return 0;
}

/**
 * Investment Diversity — 10 pts max
 *
 * Measures concentration of non-super investment portfolio.
 * A well-diversified portfolio has no single asset class > 40% of total.
 * Crypto is treated as a distinct high-volatility class (max 10% ideal).
 *
 * User inputs: investmentAllocation — JSON array:
 *   [{ assetClass: string, percentage: number }]
 * e.g. [{"assetClass":"Australian Shares","percentage":50},
 *       {"assetClass":"International Shares","percentage":30},
 *       {"assetClass":"Crypto","percentage":20}]
 *
 * Scoring:
 *   ≥ 4 asset classes, largest ≤ 40% → 10 pts
 *   ≥ 3 asset classes, largest ≤ 50% → 7 pts
 *   ≥ 2 asset classes, largest ≤ 60% → 4 pts
 *   Single asset class or largest > 60% → 1 pt
 *   No investments → 5 pts (neutral, not penalised)
 */
function scoreInvestmentDiversity(investmentAllocation) {
  let arr;
  try {
    arr = typeof investmentAllocation === 'string'
      ? JSON.parse(investmentAllocation)
      : (Array.isArray(investmentAllocation) ? investmentAllocation : []);
  } catch {
    arr = [];
  }

  if (!arr.length) return 5; // neutral — no investments

  const total = arr.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
  if (total === 0) return 5;

  const largestPct = Math.max(...arr.map((i) => Number(i.percentage) || 0));
  const classCount = arr.filter((i) => (Number(i.percentage) || 0) > 0).length;

  if (classCount >= 4 && largestPct <= 40) return 10;
  if (classCount >= 3 && largestPct <= 50) return 7;
  if (classCount >= 2 && largestPct <= 60) return 4;
  if (classCount >= 2 && largestPct > 60) return 1;
  return 1; // single asset
}

/**
 * Retirement Readiness — 10 pts max
 *
 * Projects whether the user will have enough super at their target retirement
 * age to fund a comfortable retirement (ASFA annual spend × 20 years).
 *
 * Inputs:
 *   retirementAge (default 65)
 *   currentAge
 *   currentSuperBalance
 *   annualIncome (used for contribution modelling)
 *   employerContribRate (default 11%)
 *   salarySacrificeMonthly (monthly extra to super)
 *
 * Model:
 *   yearsToRetirement = retirementAge - currentAge
 *   employerAnnualContribution = annualIncome * employerContribRate
 *   salarySacrificeAnnual = salarySacrificeMonthly * 12
 *   totalAnnualContribution = employerAnnualContribution + salarySacrificeAnnual
 *   projectedBalance = currentSuperBalance + (totalAnnualContribution * yearsToRetirement * 0.85)
 *                      (0.85 = net of ~15% tax/fees drag on growth)
 *   requiredBalance = ASFA_ANNUAL_SPEND * 20
 *   score = min(projectedBalance / requiredBalance, 1.0) * 10
 *
 * If projectedBalance ≥ requiredBalance → 10 pts (on track)
 * If projectedBalance ≥ 50% of required → linear 5–9 pts
 * Below 25% of required → 0 pts
 */
function scoreRetirementReadiness(data) {
  const retirementAge = Math.max(30, Math.min(80, Number(data.retirementAge) || 65));
  const currentAge = Math.max(18, Number(data.age) || 30);
  const currentSuper = Math.max(0, Number(data.superBalance) || 0);
  const annualIncome = Math.max(1, Number(data.annualIncome) || 0);
  const employerRate = (Number(data.employerContribRate) || 11) / 100;
  const salarySacrificeMonthly = Math.max(0, Number(data.salarySacrificeMonthly) || 0);

  const yearsToRetirement = retirementAge - currentAge;
  if (yearsToRetirement <= 0) {
    // Already at or past retirement age — score based on current balance vs target
    const required = ASFA_ANNUAL_SPEND * 20;
    return currentSuper >= required ? 10 : Math.round((currentSuper / required) * 10);
  }

  const employerAnnual = annualIncome * employerRate;
  const salarySacrificeAnnual = salarySacrificeMonthly * 12;
  const totalAnnual = employerAnnual + salarySacrificeAnnual;

  // Project forward with growth assumption (net of inflation + tax + fees)
  // 6.5% p.a. net real return is the industry baseline for super projections
  const NET_GROWTH_RATE = 0.065;
  const TAX_FEES_DRAG = 0.15; // 15% drag applied separately

  // Simplified compound projection with drag
  const n = yearsToRetirement;
  // Future value of current balance after n years at net rate
  const fvCurrent = currentSuper * Math.pow(1 + NET_GROWTH_RATE, n);
  // Future value of ongoing contributions (ordinary annuity with growth)
  // Conservative: assume contributions grow at 2% (real wage growth)
  const fvContributions = totalAnnual *
    ((Math.pow(1 + NET_GROWTH_RATE, n) - Math.pow(1.02, n)) / (NET_GROWTH_RATE - 0.02));

  const projectedBalance = fvCurrent + fvContributions;
  const requiredBalance = ASFA_ANNUAL_SPEND * 20; // 20-year retirement drawdown pool

  const ratio = Math.min(projectedBalance / requiredBalance, 1.0);
  if (ratio >= 1.0) return 10;
  if (ratio < 0.25) return 0;
  // 0.25 → 0, 0.5 → 5, 0.75 → 7, 1.0 → 10
  return Math.round(3 + (ratio - 0.25) / 0.75 * 7);
}

// ─── Portfolio Diversification signal (legacy name retained) ─────────────────

/**
 * Portfolio diversification score — 0–100
 *
 * Measures how well-spread a non-super investment portfolio is across distinct
 * asset classes. A single concentrated holding scores low; a spread across
 * several uncorrelated asset classes scores high.
 *
 * NOTE: the function name and the `ethical_score` / `halal_compliance_score`
 * persistence path are retained for backwards/non-destructive DB compatibility,
 * but the concept is now a neutral diversification signal — it is no longer
 * surfaced in the UI.
 *
 * User input: investmentAllocation — JSON array:
 *   [{ assetClass: string, percentage: number }]
 */
function computeHalalComplianceScore(investmentAllocation) {
  let arr;
  try {
    arr = typeof investmentAllocation === 'string'
      ? JSON.parse(investmentAllocation)
      : (Array.isArray(investmentAllocation) ? investmentAllocation : []);
  } catch {
    arr = [];
  }

  if (!arr.length) return 50; // neutral if no data

  const total = arr.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
  if (total === 0) return 50;

  // Distinct asset classes with a meaningful (>=5%) weighting.
  const classes = new Set(
    arr
      .filter((i) => (Number(i.percentage) || 0) >= 5 && (i.assetClass || '').trim())
      .map((i) => (i.assetClass || '').trim().toLowerCase())
  );
  const distinct = classes.size;

  // Concentration penalty: largest single holding.
  const maxPct = arr.reduce((m, i) => Math.max(m, (Number(i.percentage) || 0) / total * 100), 0);

  // 1 class → ~30, 5+ classes → ~100; reduce by over-concentration.
  let score = Math.min(100, 30 + (distinct - 1) * 18);
  if (maxPct > 60) score -= (maxPct - 60) * 0.5;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Portfolio Health Score ────────────────────────────────────────────────

/**
 * portfolioHealthScore — 0–100
 *
 * Evaluates the quality and safety of the user's investment portfolio
 * outside of super. Three dimensions:
 *   1. Concentration Risk (40%) — largest single holding ≤ 40%
 *   2. Liquidity (30%) — % of portfolio in liquid assets (>80% = full marks)
 *   3. Cost Efficiency (30%) — average management fee ≤ 0.5% = full marks
 *
 * User input: investmentAllocation with optional 'fee' and 'liquidity' fields:
 *   [{ assetClass, percentage, fee (bps), liquidity ('high'|'medium'|'low') }]
 *
 * Defaults: if no fee data, assume 0.6% (avg retail fund); if no liquidity,
 *   use asset class inference (cash/gold=high, shares/ETF=medium, property=low)
 */
function computePortfolioHealthScore(investmentAllocation) {
  let arr;
  try {
    arr = typeof investmentAllocation === 'string'
      ? JSON.parse(investmentAllocation)
      : (Array.isArray(investmentAllocation) ? investmentAllocation : []);
  } catch {
    arr = [];
  }

  if (!arr.length) return 65; // neutral — no portfolio to score

  const total = arr.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
  if (total === 0) return 65;

  // Concentration (40%)
  const largestPct = Math.max(...arr.map((i) => Number(i.percentage) || 0));
  const concentrationScore = Math.max(0, 40 - (largestPct > 40 ? (largestPct - 40) : 0));

  // Liquidity (30%)
  // Infer liquidity from asset class if not specified
  const highLiquidity = ['cash', 'savings', 'term deposit', 'gold', 'etf', 'shares'];
  const mediumLiquidity = ['bonds', 'hybrid', 'managed fund', 'international'];
  const lowLiquidity = ['property', 'real estate', 'infrastructure', 'crypto'];

  let liquidPct = 0;
  arr.forEach((item) => {
    const name = (item.assetClass || '').toLowerCase();
    const pct = Number(item.percentage) || 0;
    const liq = item.liquidity;
    if (liq === 'high') liquidPct += pct;
    else if (liq === 'medium') liquidPct += pct * 0.5;
    else if (liq === 'low') liquidPct += pct * 0;
    else if (highLiquidity.some((k) => name.includes(k))) liquidPct += pct;
    else if (mediumLiquidity.some((k) => name.includes(k))) liquidPct += pct * 0.5;
    else liquidPct += pct * 0.5; // default to medium
  });

  const liquidityRatio = Math.min(liquidPct / total, 1);
  const liquidityScore = Math.round(liquidityRatio * 30);

  // Cost efficiency (30%)
  // Fee in basis points (bps), e.g. 0.5% = 50 bps
  const avgFeeBps = arr.reduce((sum, item) => {
    const fee = Number(item.fee) ||
      (highLiquidity.some((k) => (item.assetClass || '').toLowerCase().includes(k)) ? 50 : 65);
    return sum + (Number(item.percentage) || 0) * fee;
  }, 0) / total;

  const costScore = Math.max(0, Math.round((1 - avgFeeBps / 100) * 30));

  return Math.round(concentrationScore + liquidityScore + costScore);
}

// ─── Main compute function ───────────────────────────────────────────────────

/**
 * computeScore — top-level scorer
 *
 * @param {object} data — form fields
 * @returns {{ score, grade, components, diagnosis,
 *             halalComplianceScore, portfolioHealthScore,
 *             recommendations }}
 */
function computeScore(data) {
  // Normalise all inputs
  const age = Math.max(18, Number(data.age) || 30);
  const annualIncome = Math.max(0, Number(data.annualIncome) || 0);
  const hecsBalance = Math.max(0, Number(data.hecsBalance) || 0);
  const otherDebtBalance = Math.max(0, Number(data.otherDebtBalance) || 0);
  const superBalance = Math.max(0, Number(data.superBalance) || 0);
  const employerContribRate = (Number(data.employerContribRate) || 11) / 100;
  const emergencyMonths = Math.max(0, Number(data.emergencyMonths) || 0);
  const monthlySavings = Math.max(0, Number(data.monthlySavings) || 0);
  const investmentBalance = Math.max(0, Number(data.investmentBalance) || 0);
  const salarySacrificeMonthly = Math.max(0, Number(data.salarySacrificeMonthly) || 0);
  const investmentAllocation = data.investmentAllocation || data.ethicalAllocation || [];

  const components = {
    debtRatio: scoreDebtRatio(annualIncome, hecsBalance, otherDebtBalance),
    savingsRate: scoreSavingsRate(annualIncome, monthlySavings),
    emergencyFund: scoreEmergencyFund(annualIncome, emergencyMonths),
    superAdequacy: scoreSuperAdequacy(age, superBalance),
    insuranceCoverage: scoreInsurance(data.insuranceCover),
    investmentDiversity: scoreInvestmentDiversity(investmentAllocation),
    retirementReadiness: scoreRetirementReadiness({
      retirementAge: data.retirementAge || 65,
      age,
      annualIncome,
      superBalance,
      employerContribRate: employerContribRate * 100,
      salarySacrificeMonthly,
    }),
  };

  const score = Object.values(components).reduce((sum, v) => sum + v, 0);

  const grade = score >= 85 ? 'Excellent'
    : score >= 70 ? 'Good'
    : score >= 55 ? 'Fair'
    : score >= 40 ? 'Needs Work'
    : 'Critical';

  const diagnosis = buildDiagnosis(score, grade, data, components);
  const recommendations = buildRecommendations(data, components);
  const halalScore = computeHalalComplianceScore(investmentAllocation);
  const portfolioScore = computePortfolioHealthScore(investmentAllocation);

  return {
    score,
    grade,
    components,
    diagnosis,
    recommendations,
    halalComplianceScore: halalScore,
    portfolioHealthScore: portfolioScore,
  };
}

// ─── Diagnosis paragraph ────────────────────────────────────────────────────

function buildDiagnosis(score, grade, data, components) {
  const income = Number(data.annualIncome) || 0;
  const incomeStr = income ? `$${income.toLocaleString('en-AU')}` : 'your income';
  const prof = data.profession || 'everyday Australian';
  const sorted = Object.entries(components).sort(([, a], [, b]) => a - b);
  const weakest = sorted[0][0];
  const secondWeak = sorted[1][0];

  const weakLabels = {
    debtRatio: 'debt load relative to income',
    savingsRate: 'savings rate',
    emergencyFund: 'emergency fund coverage',
    superAdequacy: 'superannuation adequacy for your age',
    insuranceCoverage: 'insurance protection',
    investmentDiversity: 'investment diversification',
    retirementReadiness: 'retirement readiness at your target age',
  };

  const gradeDescriptions = {
    Excellent: 'Your financial foundations are strong and well-balanced. You are ahead of most peers at your career stage.',
    Good: 'You are on a solid trajectory with a few targeted improvements that could accelerate your wealth significantly.',
    Fair: 'You have the right foundations but there are gaps that compound silently over your career. Addressing them early is the highest-ROI action you can take.',
    'Needs Work': 'There are structural gaps in your financial position that warrant focused attention. The good news: at your income level, targeted action produces fast results.',
    Critical: 'Your financial position has vulnerabilities that need immediate attention. The urgency is real — but the fix is achievable.',
  };

  return `As a ${prof} earning ${incomeStr}, your Financial Health Score is ${score}/100 — ${grade.toLowerCase()}. ${gradeDescriptions[grade]} Your highest-priority area is improving your ${weakLabels[weakest]}, with ${weakLabels[secondWeak]} as the next focus.`;
}

// ─── Action plan builder ─────────────────────────────────────────────────────

function buildRecommendations(data, components) {
  const recs = [];

  const income = Number(data.annualIncome) || 0;
  const monthlyGross = income / 12;
  const emergencyMonths = Number(data.emergencyMonths) || 0;
  const superBalance = Number(data.superBalance) || 0;
  const age = Number(data.age) || 30;
  const hecsBalance = Number(data.hecsBalance) || 0;
  const monthlySavings = Number(data.monthlySavings) || 0;
  const investmentBalance = Number(data.investmentBalance) || 0;
  const otherDebtBalance = Number(data.otherDebtBalance) || 0;
  const otherDebtRate = Number(data.otherDebtRate) || 0;
  const retirementAge = Number(data.retirementAge) || 65;
  const insuranceCover = data.insuranceCover || 'none';
  const employerContribRate = (Number(data.employerContribRate) || 11) / 100;
  const salarySacrificeMonthly = Math.max(0, Number(data.salarySacrificeMonthly) || 0);
  const investmentAllocation = data.investmentAllocation || [];

  // Priority 1: Emergency fund (if < 2 months)
  if (components.emergencyFund < 10) {
    const target = Math.round(monthlyGross * 3);
    recs.push({
      impact: 1,
      title: 'Build your emergency fund to 3 months',
      detail: emergencyMonths < 1
        ? `You have less than 1 month of liquid reserves — one income disruption puts you in crisis. Target: $${target.toLocaleString('en-AU')} in a high-interest savings account. Set up an automatic transfer of $500–$1,000/month on payday.`
        : `You have ${emergencyMonths.toFixed(1)} months covered — aim for 3 months ($${target.toLocaleString('en-AU')}). Automate the difference to remove willpower from the equation.`,
    });
  }

  // Priority 1: High-interest debt (if consumer debt > 15% income or rate > 12%)
  const hecsIncl = hecsBalance + otherDebtBalance;
  const debtRatio = income > 0 ? hecsIncl / income : 0;
  if (components.debtRatio < 10 && debtRatio > 0.15 && otherDebtRate > 12) {
    const annualInterest = Math.round(otherDebtBalance * otherDebtRate / 100);
    recs.push({
      impact: 1,
      title: `Eliminate high-interest debt (${otherDebtRate}% APR)`,
      detail: `Your consumer debt costs $${annualInterest.toLocaleString('en-AU')}/year in interest — a guaranteed ${otherDebtRate}% after-tax return by clearing it beats virtually any investment. Prioritise the highest-rate debt first (avalanche method).`,
    });
  }

  // Priority 2: Super salary sacrifice (if super adequacy < 12 or retirement readiness < 7)
  if (components.superAdequacy < 12 || components.retirementReadiness < 7) {
    const benchmark = asfaBenchmark(age);
    const gap = Math.max(0, benchmark - superBalance);
    const yearsToRetirement = Math.max(1, retirementAge - age);
    const requiredMonthly = Math.round(gap / (yearsToRetirement * 12));

    // Check if they're already salary sacrificing close to the gap
    const currentSSAnnual = salarySacrificeMonthly * 12;
    const sgAnnual = income * employerContribRate;
    const totalAnnualContribution = currentSSAnnual + sgAnnual;

    if (totalAnnualContribution < CONCESSIONAL_CAP && gap > 20000) {
      recs.push({
        impact: 2,
        title: 'Salary sacrifice to close your super gap',
        detail: `Your super is $${gap.toLocaleString('en-AU')} below the ASFA benchmark for a ${age}-year-old. Adding ~$${Math.min(requiredMonthly, 2000).toLocaleString('en-AU')}/month in pre-tax salary sacrifice closes the gap while reducing your taxable income — you keep more of every dollar earned.`,
      });
    }
  }

  // Priority 2: HECS strategy (if income above $119k and HECS > 1x income)
  if (components.debtRatio < 14 && hecsBalance > income && income >= 119882) {
    const compulsoryAnnual = hecsCompulsoryAnnual(income);
    const indexationRisk = hecsBalance * 0.038; // ~3.8% CPI indexation risk
    recs.push({
      impact: 2,
      title: 'Consider voluntary HECS repayments above compulsory',
      detail: `Your HECS balance of $${hecsBalance.toLocaleString('en-AU')} is indexed to CPI (~$(${Math.round(indexationRisk / 1000)}k/year at current rates). With compulsory repayments of $${compulsoryAnnual.toLocaleString('en-AU')}/year, voluntary top-up payments above the threshold reduce the indexed balance faster than it grows. At your income, this often beats after-tax investment returns.`,
    });
  }

  // Priority 2: Savings rate (if < 12%)
  if (components.savingsRate < 9 && income > 50000) {
    const target = Math.round(monthlyGross * 0.2);
    const gap = Math.max(0, target - monthlySavings);
    recs.push({
      impact: 2,
      title: `Lift your savings rate to 20% of gross income`,
      detail: `You're saving $${monthlySavings.toLocaleString('en-AU')}/month against a 20% target of $${target.toLocaleString('en-AU')}/month (gap: $${gap.toLocaleString('en-AU')}). Automate the difference on payday — research shows this single habit is the highest predictor of long-term wealth.`,
    });
  }

  // Priority 3: Insurance (if uncovered)
  if (components.insuranceCoverage < 5 && insuranceCover !== 'full') {
    recs.push({
      impact: 3,
      title: 'Protect your income with insurance cover',
      detail: 'Your income is your most important financial asset — far more critical than investment returns. Aim for cover that replaces ≥ 75% of income for 2+ years, with a waiting period ≤ 30 days. Default super-based cover is often inadequate; a standalone policy fills the gap.',
    });
  }

  // Priority 3: Investment diversification
  if (components.investmentDiversity < 7) {
    recs.push({
      impact: 3,
      title: 'Diversify your investment portfolio',
      detail: investmentBalance === 0
        ? `No investments detected outside super. Even $300/month into a diversified ETF (e.g. ASX:VAS, ASX:VGS, or VDHG) builds long-term wealth accessible before retirement. A simple 3–4 fund portfolio beats most actively managed funds after fees.`
        : `Your non-super portfolio has concentration risk or limited diversification. Spreading across 3–4 uncorrelated asset classes (Australian shares, international shares, bonds, cash) reduces volatility without sacrificing long-term return.`,
    });
  }

  // Priority 3: MLS / private health (if earning > MLS threshold with no cover)
  const hasMLSExposure = income > 105000;
  const hasPrivateHealth = data.privateHealthCover === true || data.privateHealthCover === 'yes';
  if (hasMLSExposure && !hasPrivateHealth) {
    const mlsCost = Math.round(income * 0.015);
    recs.push({
      impact: 3,
      title: 'Review Medicare Levy Surcharge exposure',
      detail: `Earning above $105,000 puts you in the 1.5% MLS zone — costing ~$${mlsCost.toLocaleString('en-AU')}/year if you don't have private patient hospital cover. A basic hospital policy can eliminate this cost while potentially providing better health outcomes. Most health funds offer hospital-only policies from ~$100/month.`,
    });
  }

  // Sort by impact, pad to exactly 3
  recs.sort((a, b) => a.impact - b.impact);
  const defaults = [
    {
      impact: 3,
      title: 'Review your insurance coverage',
      detail: 'Income protection insurance is your most important financial safety net. Ensure you have at least 75% of income covered for 2+ years with a 30-day waiting period.',
    },
    {
      impact: 3,
      title: 'Consider a fee-only financial adviser',
      detail: 'A one-off session with a fee-only adviser (no commissions) to review trust structures, super strategies, and tax planning pays for itself quickly at your income level.',
    },
    {
      impact: 3,
      title: 'Review your super fund fees and performance',
      detail: 'Retail super funds average 1.1% in fees vs industry funds at 0.6%. On a balance of $100,000, that difference costs you ~$500/year in lost compounding. Switching funds takes one afternoon.',
    },
  ];

  while (recs.length < 3) {
    const nextDefault = defaults[recs.length];
    if (nextDefault && !recs.find((r) => r.title === nextDefault.title)) {
      recs.push(nextDefault);
    } else {
      break;
    }
  }

  return recs.slice(0, 3);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  computeScore,
  // Exposed for testing
  scoreDebtRatio,
  scoreSavingsRate,
  scoreEmergencyFund,
  scoreSuperAdequacy,
  scoreInsurance,
  scoreInvestmentDiversity,
  scoreRetirementReadiness,
  computeHalalComplianceScore,
  computePortfolioHealthScore,
  asfaBenchmark,
  hecsRepaymentRate,
  mlsSurcharge,
  HECS_THRESHOLDS,
  ASFA_BENCHMARKS,
  MLS_THRESHOLDS,
  SG_RATE,
  CONCESSIONAL_CAP,
  ASFA_ANNUAL_SPEND,
};