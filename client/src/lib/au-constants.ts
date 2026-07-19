/**
 * Australian financial constants, keyed by financial year — client wrapper.
 *
 * SINGLE SOURCE OF TRUTH: the pure DATA lives in shared/au-constants.json
 * (repo root), shared with the server wrapper lib/au-constants.js so the
 * calculators can never drift from the AUTHORITATIVE FY-keyed figures.
 * This module mirrors the server's lookup + calculation behaviour in typed
 * ESM form. In the JSON an open-ended `upTo` is null — restored to Infinity
 * here. All results are indicative/educational estimates only.
 */

import rawSets from "../../../shared/au-constants.json";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface IncomeTaxBracket {
  upTo: number;
  rate: number;
}

export interface MedicareConstants {
  levyRate: number;
  lowIncomeSingle: number;
  lowIncomeSingleUpper: number;
  phaseInRate: number;
}

export interface MlsTier {
  upTo: number;
  rate: number;
}

export interface HecsConstants {
  system: string;
  minThreshold: number;
  band1To: number;
  band1Rate: number;
  band2Rate: number;
  tenPercentAbove: number;
  topRate: number;
  indexationRate: number;
}

export interface SuperConstants {
  sgRate: number;
  concessionalCap: number;
  nonConcessionalCap: number;
  nonConcessionalBringForward: number;
  bringForwardTsbLimit?: number;
  transferBalanceCap: number;
  division293Threshold: number;
  division293ExtraRate: number;
  preservationAgeDefault: number;
  earningsRateInAccumulation: number;
  earningsRateInPension: number;
}

export interface CgtConstants {
  discountMinHoldMonths: number;
  discountRate: number;
}

export interface LitoConstants {
  maxOffset: number;
  fullOffsetUpTo: number;
  phaseOut1Rate: number;
  phaseOut1End: number;
  phaseOut2Rate: number;
  phaseOut2End: number;
}

export interface AsfaConstants {
  comfortableSingle: number;
  comfortableCouple: number;
}

export interface ConstantSet {
  fy: string;
  effectiveFrom: string;
  reviewed: string;
  sources: string[];
  incomeTaxBrackets: IncomeTaxBracket[];
  medicare: MedicareConstants;
  mlsSinglesTiers: MlsTier[];
  hecs: HecsConstants;
  super: SuperConstants;
  cgt: CgtConstants;
  lito: LitoConstants;
  asfa: AsfaConstants;
  keyDates: Record<string, string>;
  stale?: boolean;
  wantedFy?: string;
}

type RawBracket = { upTo: number | null; rate: number };
type RawSet = Omit<ConstantSet, "incomeTaxBrackets" | "mlsSinglesTiers"> & {
  incomeTaxBrackets: RawBracket[];
  mlsSinglesTiers: RawBracket[];
};

const restoreInfinity = (set: RawSet): ConstantSet => ({
  ...set,
  incomeTaxBrackets: set.incomeTaxBrackets.map((b) => ({
    ...b,
    upTo: b.upTo === null ? Infinity : b.upTo,
  })),
  mlsSinglesTiers: set.mlsSinglesTiers.map((t) => ({
    ...t,
    upTo: t.upTo === null ? Infinity : t.upTo,
  })),
});

export const CONSTANT_SETS: Record<string, ConstantSet> = Object.fromEntries(
  Object.entries(rawSets as unknown as Record<string, RawSet>).map(
    ([fy, set]) => [fy, restoreInfinity(set)],
  ),
);

/* -------------------------------------------------------------------------- */
/*  FY lookup (mirrors lib/au-constants.js)                                     */
/* -------------------------------------------------------------------------- */

/** 'YYYY-YY' financial-year label for a date (AU FY runs 1 July – 30 June). */
export function fyForDate(date?: string | Date): string {
  let year: number;
  let month: number; // 0-11, July = 6
  const m = typeof date === "string" && date.match(/^(\d{4})-(\d{2})/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]) - 1;
  } else {
    const d = date ? new Date(date) : new Date();
    year = d.getFullYear();
    month = d.getMonth();
  }
  const startYear = month >= 6 ? year : year - 1;
  return startYear + "-" + String((startYear + 1) % 100).padStart(2, "0");
}

/**
 * Constants set in force on `date` (default: today). Exact FY match first;
 * otherwise the newest set whose effectiveFrom is not in the future (flagged
 * stale).
 */
export function getConstants(date?: string | Date): ConstantSet {
  const fy = fyForDate(date);
  if (CONSTANT_SETS[fy]) return CONSTANT_SETS[fy];
  const d = date ? new Date(date) : new Date();
  const eligible = Object.values(CONSTANT_SETS)
    .filter((s) => new Date(s.effectiveFrom) <= d)
    .sort(
      (a, b) =>
        new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
    );
  const fallback = eligible[0] || Object.values(CONSTANT_SETS)[0];
  return { ...fallback, stale: true, wantedFy: fy };
}

/* -------------------------------------------------------------------------- */
/*  Calculations (mirrors lib/au-constants.js)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Medicare levy for a single taxpayer (no dependants), including the
 * low-income shading-in band: zero at/below the lower threshold, 10c per $1
 * over it up to the upper threshold, then the full 2% of total income.
 */
export function medicareLevy(taxableIncome: number, date?: string | Date): number {
  const m = getConstants(date).medicare;
  const ti = Math.max(0, Number(taxableIncome) || 0);
  if (ti <= m.lowIncomeSingle) return 0;
  if (ti >= m.lowIncomeSingleUpper) return ti * m.levyRate;
  return (ti - m.lowIncomeSingle) * m.phaseInRate;
}

/** Raw bracket tax (before offsets) on a taxable income. */
export function computeBracketTax(taxableIncome: number, date?: string | Date): number {
  const c = getConstants(date);
  const ti = Math.max(0, Number(taxableIncome) || 0);
  let tax = 0;
  let lower = 0;
  for (const b of c.incomeTaxBrackets) {
    if (ti <= lower) break;
    tax += (Math.min(ti, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

/** Low Income Tax Offset for a taxable income. */
export function computeLito(taxableIncome: number, date?: string | Date): number {
  const L = getConstants(date).lito;
  const ti = Math.max(0, Number(taxableIncome) || 0);
  if (ti <= L.fullOffsetUpTo) return L.maxOffset;
  if (ti <= L.phaseOut1End) {
    return L.maxOffset - L.phaseOut1Rate * (ti - L.fullOffsetUpTo);
  }
  if (ti <= L.phaseOut2End) {
    return Math.max(
      0,
      L.maxOffset -
        L.phaseOut1Rate * (L.phaseOut1End - L.fullOffsetUpTo) -
        L.phaseOut2Rate * (ti - L.phaseOut1End),
    );
  }
  return 0;
}

/**
 * Income tax + LITO + Medicare for a resident individual (educational
 * estimate). Mirrors lib/au-constants.js computeIncomeTax.
 */
export function computeIncomeTax(taxableIncome: number, date?: string | Date) {
  const c = getConstants(date);
  const ti = Math.max(0, Number(taxableIncome) || 0);
  const tax = computeBracketTax(ti, date);
  const lito = computeLito(ti, date);
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

/** Annual HECS-HELP repayment under the marginal system (from 1 July 2025). */
export function computeHecsRepayment(
  repaymentIncome: number,
  hecsBalance: number,
  date?: string | Date,
) {
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

/**
 * Marginal income-tax rate at a taxable income. Bracket boundaries are
 * inclusive at the top of each bracket (continuous thresholds): exactly
 * $45,000 / $135,000 / $190,000 still sit in the bracket below.
 */
export function marginalIncomeTaxRate(taxableIncome: number, date?: string | Date): number {
  const c = getConstants(date);
  const ti = Math.max(0, Number(taxableIncome) || 0);
  for (const b of c.incomeTaxBrackets) {
    if (ti <= b.upTo) return b.rate;
  }
  return c.incomeTaxBrackets[c.incomeTaxBrackets.length - 1].rate;
}

/**
 * Marginal Medicare levy rate at a taxable income: 0 below the low-income
 * threshold, the 10% shade-in rate inside the band, then the full levy rate.
 */
export function marginalMedicareRate(taxableIncome: number, date?: string | Date): number {
  const m = getConstants(date).medicare;
  const ti = Math.max(0, Number(taxableIncome) || 0);
  if (ti <= m.lowIncomeSingle) return 0;
  if (ti < m.lowIncomeSingleUpper) return m.phaseInRate;
  return m.levyRate;
}

/** Combined marginal rate (income tax + Medicare) on the next dollar. */
export function combinedMarginalRate(taxableIncome: number, date?: string | Date): number {
  return marginalIncomeTaxRate(taxableIncome, date) + marginalMedicareRate(taxableIncome, date);
}

/**
 * Medicare Levy Surcharge for a single taxpayer from the FY-keyed singles
 * tiers (0 when the taxpayer has private hospital cover).
 */
export function computeMls(
  taxableIncome: number,
  hasPrivateCover: boolean,
  date?: string | Date,
): number {
  if (hasPrivateCover) return 0;
  const c = getConstants(date);
  const ti = Math.max(0, Number(taxableIncome) || 0);
  for (const tier of c.mlsSinglesTiers) {
    if (ti <= tier.upTo) return ti * tier.rate;
  }
  const top = c.mlsSinglesTiers[c.mlsSinglesTiers.length - 1];
  return ti * top.rate;
}

/** Base income above which the MLS starts for singles (first tier ceiling). */
export function mlsBaseThreshold(date?: string | Date): number {
  return getConstants(date).mlsSinglesTiers[0].upTo;
}
