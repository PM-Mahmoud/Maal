'use strict';
// FY2025-26 Australian financial constants — injected into every advisor prompt
// Update annually after 1 July. Source: ATO, DSS, APRA, ASIC MoneySmart.

const FY = '2025-26';

const INCOME_TAX_BRACKETS = [
  { from: 0,       to: 18200,  rate: 0,     base: 0 },
  { from: 18201,   to: 45000,  rate: 0.19,  base: 0 },
  { from: 45001,   to: 135000, rate: 0.325, base: 5092 },
  { from: 135001,  to: 190000, rate: 0.37,  base: 34342 },
  { from: 190001,  to: Infinity, rate: 0.45, base: 54942 },
];

const MEDICARE_LEVY_RATE    = 0.02;
const MEDICARE_LEVY_EXEMPTION_THRESHOLD_SINGLE = 24276;
const MEDICARE_LEVY_SURCHARGE_THRESHOLDS = [
  { from: 0,       to: 93000,  rate: 0 },
  { from: 93001,   to: 108000, rate: 0.01 },
  { from: 108001,  to: 144000, rate: 0.0125 },
  { from: 144001,  to: Infinity, rate: 0.015 },
];

const HECS_REPAYMENT_THRESHOLDS = [
  { from: 0,       to: 54434,  rate: 0 },
  { from: 54435,   to: 62844,  rate: 0.01 },
  { from: 62845,   to: 66306,  rate: 0.02 },
  { from: 66307,   to: 72153,  rate: 0.025 },
  { from: 72154,   to: 80000,  rate: 0.03 },
  { from: 80001,   to: 86739,  rate: 0.035 },
  { from: 86740,   to: 91299,  rate: 0.04 },
  { from: 91300,   to: 97006,  rate: 0.045 },
  { from: 97007,   to: 107213, rate: 0.05 },
  { from: 107214,  to: 112785, rate: 0.055 },
  { from: 112786,  to: 119023, rate: 0.06 },
  { from: 119024,  to: 124999, rate: 0.065 },
  { from: 125000,  to: 136047, rate: 0.07 },
  { from: 136048,  to: 143008, rate: 0.075 },
  { from: 143009,  to: 150000, rate: 0.08 },
  { from: 150001,  to: 157539, rate: 0.085 },
  { from: 157540,  to: 166584, rate: 0.09 },
  { from: 166585,  to: 176835, rate: 0.095 },
  { from: 176836,  to: Infinity, rate: 0.10 },
];

const SUPER = {
  sgRate: 0.12,
  concessionalCap: 30000,
  nonConcessionalCap: 120000,
  nonConcessionalBringForward: 360000,
  transferBalanceCap: 1900000,
  tsbCapForNonConcessional: 1900000,
  division293Threshold: 250000,
  division293ExtraRate: 0.15,
  preservationAgeDefault: 60,
  earningsRateInAccumulation: 0.15,
  earningsRateInPension: 0,
};

const ASFA = {
  comfortableSingle: 595000,
  comfortableCouple: 690000,
};

const CGT = {
  discountMinHoldMonths: 12,
  discountRate: 0.50,
};

const LITO = {
  maxOffset: 700,
  fullOffsetUpTo: 37500,
  phaseOut1Rate: 0.05,
  phaseOut1End: 45000,
  phaseOut2Rate: 0.015,
  phaseOut2End: 66667,
};

const KEY_DATES = {
  eofy:                  'June 30',
  newFY:                 'July 1',
  hecsIndexation:        'June 1',
  taxReturnDeadline:     'October 31',
  taxAgentDeadline:      'May 15',
  sgQ1Due:               'October 28',
  sgQ2Due:               'January 28',
  sgQ3Due:               'April 28',
  sgQ4Due:               'July 28',
  hecsIndexationRate2025: 0.032,
};

/**
 * Compute income tax + Medicare for a resident individual
 */
function computeIncomeTax(taxableIncome) {
  const ti = Number(taxableIncome) || 0;

  let base = 0, rate = 0;
  for (const b of INCOME_TAX_BRACKETS) {
    if (ti >= b.from && (b.to === Infinity || ti <= b.to)) {
      base = b.base;
      rate = b.rate;
      break;
    }
  }
  const taxOnIncome = base + rate * Math.max(0, ti - (INCOME_TAX_BRACKETS.find(b => b.rate === rate)?.from ?? 0) + 1);

  // LITO
  let lito = 0;
  if (ti <= 37500) lito = LITO.maxOffset;
  else if (ti <= 45000) lito = LITO.maxOffset - LITO.phaseOut1Rate * (ti - 37500);
  else if (ti <= 66667) lito = Math.max(0, (LITO.maxOffset - LITO.phaseOut1Rate * (45000 - 37500)) - LITO.phaseOut2Rate * (ti - 45000));

  const medicare = ti > MEDICARE_LEVY_EXEMPTION_THRESHOLD_SINGLE ? ti * MEDICARE_LEVY_RATE : 0;
  const totalTax = Math.max(0, taxOnIncome - lito) + medicare;
  const netIncome = ti - totalTax;
  const effectiveRate = ti > 0 ? totalTax / ti : 0;

  return { grossIncome: ti, incomeTax: Math.round(taxOnIncome - lito), medicare: Math.round(medicare), totalTax: Math.round(totalTax), netIncome: Math.round(netIncome), effectiveRate: Math.round(effectiveRate * 1000) / 10 };
}

/**
 * Compute annual HECS repayment for a given repayment income
 */
function computeHecsRepayment(repaymentIncome, hecsBalance) {
  const ri = Number(repaymentIncome) || 0;
  const balance = Number(hecsBalance) || 0;
  let rate = 0;
  for (const t of HECS_REPAYMENT_THRESHOLDS) {
    if (ri >= t.from && (t.to === Infinity || ri <= t.to)) { rate = t.rate; break; }
  }
  const annualRepayment = Math.min(ri * rate, balance);
  return { repaymentIncome: ri, rate, annualRepayment: Math.round(annualRepayment), yearsToPayOff: annualRepayment > 0 ? Math.ceil(balance / (ri * rate)) : null };
}

/**
 * Build a concise AU constants block for prompt injection
 * Keeps prompts short — only the figures most relevant to a typical user.
 */
function buildConstantsPrompt() {
  return [
    `FY${FY} Australian Financial Key Numbers:`,
    `Income tax brackets: 0% to $18,200 | 19% $18,201–$45,000 | 32.5% $45,001–$135,000 | 37% $135,001–$190,000 | 45% above $190,000. Plus 2% Medicare levy.`,
    `Medicare Levy Surcharge (if no private hospital cover): 1% above $93,000 | 1.25% above $108,000 | 1.5% above $144,000.`,
    `HECS repayment starts at $54,435 income (1%); reaches 10% above $176,836. Indexed 1 June 2025 at 3.2%.`,
    `Super: SG rate 12.0% (final). Concessional cap $30,000/yr. Non-concessional cap $120,000/yr. Transfer balance cap $1.9M. Division 293 kicks in at $250,000 (extra 15% tax on concessional contributions).`,
    `CGT: 50% discount for assets held >12 months. Tax-free primary residence.`,
    `ASFA comfortable retirement: $595,000 (single) / $690,000 (couple).`,
    `Key dates: EOFY 30 June | HECS indexation 1 June | Tax return 31 Oct (no agent) | SG Q4 due 28 July.`,
  ].join('\n');
}

module.exports = {
  FY,
  INCOME_TAX_BRACKETS,
  MEDICARE_LEVY_RATE,
  MEDICARE_LEVY_SURCHARGE_THRESHOLDS,
  HECS_REPAYMENT_THRESHOLDS,
  SUPER,
  ASFA,
  CGT,
  LITO,
  KEY_DATES,
  computeIncomeTax,
  computeHecsRepayment,
  buildConstantsPrompt,
};
