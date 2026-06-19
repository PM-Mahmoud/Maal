// Pure client-side Maal Score calculator used by the public 4-step tool.
// Weighted to 100: NetWorth 25 / Debt 20 / Super 25 / Diversification 15 / Buffer 15.

export type ScoreInputs = {
  age: number;
  income: number;
  assets: number;
  debts: number;
  superBalance: number;
};

export type PillarKey = "networth" | "debt" | "super" | "diversification" | "buffer";

export type Pillar = { key: PillarKey; label: string; weight: number; score: number };

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** ASFA Comfortable target (single) — used as the super benchmark. */
const ASFA_SINGLE_TARGET = 595000;

export function computeMaalScore(i: ScoreInputs) {
  const netWorth = i.assets - i.debts;
  // Net worth pillar: target ~ 3x annual income by mid-career, scaled by age.
  const ageFactor = clamp((i.age - 20) / 40, 0.1, 1);
  const nwTarget = Math.max(50_000, i.income * 3 * ageFactor);
  const networth = clamp((netWorth / nwTarget) * 70 + 30);

  // Debt: ratio to income. <1x great, >5x poor.
  const debtRatio = i.income > 0 ? i.debts / i.income : 0;
  const debt = clamp(100 - debtRatio * 18);

  // Super: progress toward ASFA, age-scaled.
  const superTarget = ASFA_SINGLE_TARGET * ageFactor;
  const superScore = clamp((i.superBalance / Math.max(superTarget, 1)) * 100);

  // Diversification: proxy = non-super assets share of total.
  const nonSuper = Math.max(0, i.assets - i.superBalance);
  const divRatio = i.assets > 0 ? nonSuper / i.assets : 0;
  const diversification = clamp(40 + divRatio * 60);

  // Buffer: liquid (assume 15% of assets) covering months of expenses (50% of income/12).
  const liquid = i.assets * 0.15;
  const monthlyExp = (i.income * 0.5) / 12;
  const months = monthlyExp > 0 ? liquid / monthlyExp : 0;
  const buffer = clamp((months / 6) * 100);

  const pillars: Pillar[] = [
    { key: "networth", label: "Net Worth", weight: 25, score: Math.round(networth) },
    { key: "debt", label: "Debt Health", weight: 20, score: Math.round(debt) },
    { key: "super", label: "Super Adequacy", weight: 25, score: Math.round(superScore) },
    { key: "diversification", label: "Diversification", weight: 15, score: Math.round(diversification) },
    { key: "buffer", label: "Emergency Buffer", weight: 15, score: Math.round(buffer) },
  ];

  const total = Math.round(pillars.reduce((acc, p) => acc + p.score * (p.weight / 100), 0));

  return { total, netWorth, pillars };
}

export function scoreBand(total: number): { label: string; tone: "good" | "ok" | "warn" } {
  if (total >= 80) return { label: "Strong", tone: "good" };
  if (total >= 60) return { label: "On Track", tone: "ok" };
  if (total >= 40) return { label: "Needs Attention", tone: "warn" };
  return { label: "At Risk", tone: "warn" };
}

export function formatAUD(n: number) {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}