'use strict';
// Australian financial constants, keyed by financial year.
//
// SINGLE SOURCE OF TRUTH: the pure DATA lives in shared/au-constants.json
// (repo root) so the server (this wrapper) and the React client
// (client/src/lib/au-constants.ts) can never drift apart. This file only
// adds behaviour: FY date-switching, calculations, and prompt rendering.
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
// the figures), sources (where they came from). In the JSON, an open-ended
// `upTo` is null — restored to Infinity here.
const RAW_SETS = require('../shared/au-constants.json');

function restoreInfinity(set) {
  return Object.assign({}, set, {
    incomeTaxBrackets: set.incomeTaxBrackets.map(b =>
      Object.assign({}, b, { upTo: b.upTo === null ? Infinity : b.upTo })),
    mlsSinglesTiers: set.mlsSinglesTiers.map(t =>
      Object.assign({}, t, { upTo: t.upTo === null ? Infinity : t.upTo })),
  });
}

const CONSTANT_SETS = Object.fromEntries(
  Object.entries(RAW_SETS).map(([fy, set]) => [fy, restoreInfinity(set)]),
);

// ─── FY lookup ────────────────────────────────────────────────────────────────

// 'YYYY-YY' financial-year label for a date (AU FY runs 1 July – 30 June).
// Timezone-safe: a plain 'YYYY-MM-DD' string is read by its calendar parts (so
// 1 July never slips to 30 June in a UTC-behind zone), and Date objects use
// local getters.
function fyForDate(date) {
  let year, month; // month: 0-11, July = 6
  const m = typeof date === 'string' && date.match(/^(\d{4})-(\d{2})/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]) - 1;
  } else {
    const d = date ? new Date(date) : new Date();
    year = d.getFullYear();
    month = d.getMonth();
  }
  const startYear = month >= 6 ? year : year - 1;
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

// Medicare levy for a single taxpayer (no dependants), including the low-income
// shading-in band: zero at/below the lower threshold, 10c per $1 over it up to
// the upper threshold, then the full 2% of total income. Exported so lib/tax.js
// consumes the same logic rather than duplicating a threshold cliff.
function medicareLevy(taxableIncome, date) {
  const m = getConstants(date).medicare;
  const ti = Math.max(0, Number(taxableIncome) || 0);
  if (ti <= m.lowIncomeSingle) return 0;
  if (ti >= m.lowIncomeSingleUpper) return ti * m.levyRate;
  return (ti - m.lowIncomeSingle) * m.phaseInRate;
}

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

  const medicare = medicareLevy(ti, date);
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
      repayment = ri * h.topRate;
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
    'Income tax brackets: ' + bracketBits.join(' | ') + '. Plus ' + pct(c.medicare.levyRate) + ' Medicare levy.',
    'Medicare Levy Surcharge (singles, no private hospital cover): ' + mlsBits.join(' | ') + ' (family thresholds are double).',
    'HECS-HELP (marginal system since 1 July 2025): nothing below ' + dollars(h.minThreshold) + '; ' +
      Math.round(h.band1Rate * 100) + 'c per $1 between ' + dollars(h.minThreshold) + '–' + dollars(h.band1To) + '; ' +
      Math.round(h.band2Rate * 100) + 'c per $1 above ' + dollars(h.band1To) + '; ' + pct(h.topRate) + ' of total repayment income once above ' + dollars(h.tenPercentAbove) +
      '. Debt indexed ' + c.keyDates.hecsIndexation + (h.indexationRate ? ' (latest ' + (h.indexationRate * 100).toFixed(1) + '%)' : '') + '.',
    'Super: SG rate ' + (s.sgRate * 100).toFixed(1) + '% (final legislated rate). Concessional cap ' + dollars(s.concessionalCap) + '/yr. Non-concessional cap ' + dollars(s.nonConcessionalCap) + '/yr (bring-forward ' + dollars(s.nonConcessionalBringForward) + '). Transfer balance cap ' + dollars(s.transferBalanceCap) + '. Division 293 extra ' + pct(s.division293ExtraRate) + ' tax on concessional contributions above ' + dollars(s.division293Threshold) + ' income.',
    'CGT: ' + (c.cgt.discountRate * 100) + '% discount for assets held >' + c.cgt.discountMinHoldMonths + ' months. A qualifying main residence may be fully or partly exempt (depends on eligibility and use).' +
      (c.cgt.reform && c.cgt.reform.legislated ? ' LEGISLATED CHANGE (from ' + c.cgt.reform.appliesFrom + '): ' + c.cgt.reform.summary : ''),
    'ASFA comfortable retirement: ' + dollars(c.asfa.comfortableSingle) + ' (single) / ' + dollars(c.asfa.comfortableCouple) + ' (couple).',
    'Key dates: EOFY ' + c.keyDates.eofy + ' | HECS indexation ' + c.keyDates.hecsIndexation + ' | Tax return ' + c.keyDates.taxReturnDeadline + ' (no agent) | SG Q4 due ' + c.keyDates.sgQ4Due + '.',
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
  medicareLevy,
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
