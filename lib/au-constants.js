'use strict';
// Australian financial constants, keyed by financial year.
//
// ORDER OF AUTHORITY (see specs/silvia-parity-tier1-2.md, decision 12):
// these constants are AUTHORITATIVE — they win any conflict with model
// knowledge, RAG chunks, or web search results. Only ENACTED legislation
// belongs here; proposed/rumoured changes are discussed by the advisor via
// live search, never encoded as constants.
//
// ANNUAL REVIEW CONTRACT: test/au-constants.test.js FAILS when the financial
// year that contains today's date has no entry with a `reviewed` date — CI
// demands the review every July. A legislated future change can (and should)
// be entered in advance as its own FY entry; the date-based lookup switches
// over automatically on 1 July.
//
// Monthly drift-check: services/constants-audit.js compares these figures
// against official sources (ato.gov.au via Exa) and PROPOSES discrepancies —
// a human confirms every change.

// Each set: effectiveFrom (inclusive), reviewed (date a human last verified
// the figures), sources (where they came from).
const CONSTANT_SETS = {
  '2025-26': {
    fy: '2025-26',
    effectiveFrom: '2025-07-01',
    reviewed: '2026-07-12',
    sources: [
      'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents',
      'https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds',
      'https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps',
    ],
    // Stage-3 brackets (from 1 July 2024): 16% second bracket.
    incomeTaxBrackets: [
      { upTo: 18200, rate: 0 },
      { upTo: 45000, rate: 0.16 },
      { upTo: 135000, rate: 0.30 },
      { upTo: 190000, rate: 0.37 },
      { upTo: Infinity, rate: 0.45 },
    ],
    medicare: {
      levyRate: 0.02,
      // 2024-25 legislated single low-income threshold (set retrospectively
      // each budget; latest enacted figure).
      lowIncomeThresholdSingle: 27222,
    },
    // Medicare Levy Surcharge — singles tiers (family = double, +$1,500 per
    // MLS dependent child after the first).
    mlsSinglesTiers: [
      { upTo: 101000, rate: 0 },
      { upTo: 118000, rate: 0.01 },
      { upTo: 158000, rate: 0.0125 },
      { upTo: Infinity, rate: 0.015 },
    ],
    // Marginal HECS-HELP repayment system (from 1 July 2025): nothing below
    // the threshold, 15c/$ then 17c/$ on income ABOVE each boundary; once
    // repayment income exceeds `tenPercentAbove`, repayment = 10% of total.
    hecs: {
      system: 'marginal',
      minThreshold: 67000,
      band1To: 125000,
      band1Rate: 0.15,
      band2Rate: 0.17,
      tenPercentAbove: 179286,
      indexationRate: 0.032, // 1 June 2025 debt indexation
    },
    super: {
      sgRate: 0.12, // final legislated rate
      concessionalCap: 30000,
      nonConcessionalCap: 120000,
      nonConcessionalBringForward: 360000,
      transferBalanceCap: 2000000,
      division293Threshold: 250000,
      division293ExtraRate: 0.15,
      preservationAgeDefault: 60,
      earningsRateInAccumulation: 0.15,
      earningsRateInPension: 0,
    },
    cgt: { discountMinHoldMonths: 12, discountRate: 0.50 },
    lito: {
      maxOffset: 700,
      fullOffsetUpTo: 37500,
      phaseOut1Rate: 0.05,
      phaseOut1End: 45000,
      phaseOut2Rate: 0.015,
      phaseOut2End: 66667,
    },
    asfa: { comfortableSingle: 595000, comfortableCouple: 690000 },
    keyDates: {
      eofy: 'June 30',
      newFY: 'July 1',
      hecsIndexation: 'June 1',
      taxReturnDeadline: 'October 31',
      taxAgentDeadline: 'May 15',
      sgQ1Due: 'October 28',
      sgQ2Due: 'January 28',
      sgQ3Due: 'April 28',
      sgQ4Due: 'July 28',
    },
  },

  '2026-27': {
    fy: '2026-27',
    effectiveFrom: '2026-07-01',
    reviewed: '2026-07-12',
    sources: [
      'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents',
      'https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds',
      'https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps',
      'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy-surcharge/medicare-levy-surcharge-income-thresholds-and-rates',
    ],
    // Second bracket cut 16% → 15% from 1 July 2026 (Treasury Laws Amendment
    // (More Cost of Living Relief) Act 2025); falls again to 14% on 1 July 2027.
    incomeTaxBrackets: [
      { upTo: 18200, rate: 0 },
      { upTo: 45000, rate: 0.15 },
      { upTo: 135000, rate: 0.30 },
      { upTo: 190000, rate: 0.37 },
      { upTo: Infinity, rate: 0.45 },
    ],
    medicare: {
      levyRate: 0.02,
      lowIncomeThresholdSingle: 27222, // latest enacted; updated retrospectively each budget
    },
    mlsSinglesTiers: [
      { upTo: 105000, rate: 0 },
      { upTo: 123000, rate: 0.01 },
      { upTo: 164000, rate: 0.0125 },
      { upTo: Infinity, rate: 0.015 },
    ],
    // Thresholds indexed 2.8% for 2026-27. Sanity: 15c on ($129,717−$69,528)
    // = $9,028, which is exactly the base of the 17c band; the marginal curve
    // meets 10%-of-total at $186,050. Continuous — verified.
    hecs: {
      system: 'marginal',
      minThreshold: 69528,
      band1To: 129717,
      band1Rate: 0.15,
      band2Rate: 0.17,
      tenPercentAbove: 186050,
      indexationRate: 0.028, // 1 June 2026 debt indexation
    },
    super: {
      sgRate: 0.12,
      concessionalCap: 32500, // AWOTE-indexed 1 July 2026
      nonConcessionalCap: 130000,
      nonConcessionalBringForward: 390000,
      bringForwardTsbLimit: 1840000,
      transferBalanceCap: 2100000,
      division293Threshold: 250000,
      division293ExtraRate: 0.15,
      preservationAgeDefault: 60,
      earningsRateInAccumulation: 0.15,
      earningsRateInPension: 0,
    },
    cgt: { discountMinHoldMonths: 12, discountRate: 0.50 },
    lito: {
      maxOffset: 700,
      fullOffsetUpTo: 37500,
      phaseOut1Rate: 0.05,
      phaseOut1End: 45000,
      phaseOut2Rate: 0.015,
      phaseOut2End: 66667,
    },
    asfa: { comfortableSingle: 595000, comfortableCouple: 690000 },
    keyDates: {
      eofy: 'June 30',
      newFY: 'July 1',
      hecsIndexation: 'June 1',
      taxReturnDeadline: 'October 31',
      taxAgentDeadline: 'May 15',
      sgQ1Due: 'October 28',
      sgQ2Due: 'January 28',
      sgQ3Due: 'April 28',
      sgQ4Due: 'July 28',
    },
  },
};

// ─── FY lookup ────────────────────────────────────────────────────────────────

// 'YYYY-YY' financial-year label for a date (AU FY runs 1 July – 30 June).
function fyForDate(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 6 ? y : y - 1; // months 0-11; July = 6
  return startYear + '-' + String((startYear + 1) % 100).padStart(2, '0');
}

// Constants set in force on `date` (default: today). Exact FY match first;
// otherwise the newest set whose effectiveFrom is not in the future (flagged
// stale so the freshness test can fail loudly while runtime keeps working).
function getConstants(date) {
  const fy = fyForDate(date);
  if (CONSTANT_SETS[fy]) return CONSTANT_SETS[fy];
  const d = date ? new Date(date) : new Date();
  const eligible = Object.values(CONSTANT_SETS)
    .filter(s => new Date(s.effectiveFrom) <= d)
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  const fallback = eligible[0] || Object.values(CONSTANT_SETS)[0];
  return Object.assign({}, fallback, { stale: true, wantedFy: fy });
}

// ─── Calculations ─────────────────────────────────────────────────────────────

// Income tax + LITO + Medicare for a resident individual (educational estimate).
function computeIncomeTax(taxableIncome, date) {
  const c = getConstants(date);
  const ti = Math.max(0, Number(taxableIncome) || 0);

  let tax = 0;
  let lower = 0;
  for (const b of c.incomeTaxBrackets) {
    if (ti <= lower) break;
    tax += (Math.min(ti, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }

  const L = c.lito;
  let lito = 0;
  if (ti <= L.fullOffsetUpTo) lito = L.maxOffset;
  else if (ti <= L.phaseOut1End) lito = L.maxOffset - L.phaseOut1Rate * (ti - L.fullOffsetUpTo);
  else if (ti <= L.phaseOut2End) {
    lito = Math.max(0, (L.maxOffset - L.phaseOut1Rate * (L.phaseOut1End - L.fullOffsetUpTo)) - L.phaseOut2Rate * (ti - L.phaseOut1End));
  }

  const medicare = ti > c.medicare.lowIncomeThresholdSingle ? ti * c.medicare.levyRate : 0;
  const totalTax = Math.max(0, tax - lito) + medicare;
  return {
    grossIncome: ti,
    incomeTax: Math.round(Math.max(0, tax - lito)),
    medicare: Math.round(medicare),
    totalTax: Math.round(totalTax),
    netIncome: Math.round(ti - totalTax),
    effectiveRate: ti > 0 ? Math.round((totalTax / ti) * 1000) / 10 : 0,
    fy: c.fy,
  };
}

// Annual HECS-HELP repayment under the marginal system (from 1 July 2025).
function computeHecsRepayment(repaymentIncome, hecsBalance, date) {
  const c = getConstants(date);
  const h = c.hecs;
  const ri = Math.max(0, Number(repaymentIncome) || 0);
  const balance = Math.max(0, Number(hecsBalance) || 0);
  let repayment = 0;
  if (balance > 0 && ri > h.minThreshold) {
    if (ri > h.tenPercentAbove) {
      repayment = ri * 0.10;
    } else {
      repayment =
        Math.max(0, Math.min(ri, h.band1To) - h.minThreshold) * h.band1Rate +
        Math.max(0, ri - h.band1To) * h.band2Rate;
    }
    repayment = Math.min(repayment, balance);
  }
  return {
    repaymentIncome: ri,
    annualRepayment: Math.round(repayment),
    yearsToPayOff: repayment > 0 ? Math.ceil(balance / repayment) : null,
    fy: c.fy,
  };
}

// ─── Prompt injection ─────────────────────────────────────────────────────────

function pct(rate) {
  return (rate * 100) % 1 === 0 ? (rate * 100) + '%' : (rate * 100).toFixed(2).replace(/0$/, '') + '%';
}
function dollars(n) {
  return '$' + Number(n).toLocaleString('en-AU');
}

// Concise AU constants block for prompt injection — derived from the set in
// force today so it can never drift from the data above.
function buildConstantsPrompt(date) {
  const c = getConstants(date);
  const bracketBits = [];
  let lower = 0;
  for (const b of c.incomeTaxBrackets) {
    if (b.rate === 0) bracketBits.push('0% to ' + dollars(b.upTo));
    else if (b.upTo === Infinity) bracketBits.push(pct(b.rate) + ' above ' + dollars(lower));
    else bracketBits.push(pct(b.rate) + ' ' + dollars(lower + 1) + '–' + dollars(b.upTo));
    lower = b.upTo;
  }
  const mls = c.mlsSinglesTiers.filter(t => t.rate > 0);
  const mlsBits = mls.map((t, i) => pct(t.rate) + ' above ' + dollars(i === 0 ? c.mlsSinglesTiers[0].upTo : c.mlsSinglesTiers[i].upTo));
  const h = c.hecs;
  const s = c.super;
  return [
    'FY' + c.fy + ' Australian Financial Key Numbers (AUTHORITATIVE — these override any other figures you know; only enacted law is included, treat proposed changes as proposals only):',
    'Income tax brackets: ' + bracketBits.join(' | ') + '. Plus 2% Medicare levy.',
    'Medicare Levy Surcharge (singles, no private hospital cover): ' + mlsBits.join(' | ') + ' (family thresholds are double).',
    'HECS-HELP (marginal system since 1 July 2025): nothing below ' + dollars(h.minThreshold) + '; ' +
      Math.round(h.band1Rate * 100) + 'c per $1 between ' + dollars(h.minThreshold) + '–' + dollars(h.band1To) + '; ' +
      Math.round(h.band2Rate * 100) + 'c per $1 above ' + dollars(h.band1To) + '; 10% of total repayment income once above ' + dollars(h.tenPercentAbove) +
      '. Debt indexed 1 June' + (h.indexationRate ? ' (latest ' + (h.indexationRate * 100).toFixed(1) + '%)' : '') + '.',
    'Super: SG rate ' + (s.sgRate * 100).toFixed(1) + '% (final legislated rate). Concessional cap ' + dollars(s.concessionalCap) + '/yr. Non-concessional cap ' + dollars(s.nonConcessionalCap) + '/yr (bring-forward ' + dollars(s.nonConcessionalBringForward) + '). Transfer balance cap ' + dollars(s.transferBalanceCap) + '. Division 293 extra 15% tax on concessional contributions above ' + dollars(s.division293Threshold) + ' income.',
    'CGT: ' + (c.cgt.discountRate * 100) + '% discount for assets held >' + c.cgt.discountMinHoldMonths + ' months. Primary residence exempt.',
    'ASFA comfortable retirement: ' + dollars(c.asfa.comfortableSingle) + ' (single) / ' + dollars(c.asfa.comfortableCouple) + ' (couple).',
    'Key dates: EOFY 30 June | HECS indexation 1 June | Tax return 31 Oct (no agent) | SG Q4 due 28 July.',
  ].join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────
// Legacy names (FY, SUPER, CGT, …) resolve to the set in force today so
// existing consumers keep working.

const _current = getConstants();

module.exports = {
  CONSTANT_SETS,
  fyForDate,
  getConstants,
  computeIncomeTax,
  computeHecsRepayment,
  buildConstantsPrompt,
  // Legacy aliases
  FY: _current.fy,
  INCOME_TAX_BRACKETS: _current.incomeTaxBrackets,
  MEDICARE_LEVY_RATE: _current.medicare.levyRate,
  MEDICARE_LEVY_SURCHARGE_THRESHOLDS: _current.mlsSinglesTiers,
  HECS: _current.hecs,
  SUPER: _current.super,
  ASFA: _current.asfa,
  CGT: _current.cgt,
  LITO: _current.lito,
  KEY_DATES: _current.keyDates,
};
