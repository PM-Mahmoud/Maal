// ASFA Comfortable retirement targets (single, lump sum at 67, indicative).
export const ASFA_SINGLE_TARGET = 595_000;
export const ASFA_COUPLE_TARGET = 690_000;
export const PRESERVATION_AGE = 60;
export const RETIREMENT_AGE = 67;

export type ProjectionInputs = {
  age: number;
  superBalance: number;
  annualIncome: number;
  contributionRatePct?: number; // total (SG + voluntary). Default 11.5
  expectedReturnPct?: number;   // nominal. Default 7
  volatilityPct?: number;       // std dev of returns. Default 11
  inflationPct?: number;        // Default 2.5
  target?: number;              // Default ASFA single
  iterations?: number;          // Monte Carlo runs. Default 500
};

export type ProjectionResult = {
  years: number[];
  median: number[];
  p10: number[];
  p90: number[];
  targetReal: number;
  probOfHittingTarget: number;
  shortfallReal: number; // median final vs target (real $, today's dollars)
};

// Box–Muller transform
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function projectRetirement(i: ProjectionInputs): ProjectionResult {
  const age = Math.max(18, Math.min(i.age, RETIREMENT_AGE));
  const yearsToRetire = Math.max(1, RETIREMENT_AGE - age);
  const contribRate = (i.contributionRatePct ?? 11.5) / 100;
  const mu = (i.expectedReturnPct ?? 7) / 100;
  const sigma = (i.volatilityPct ?? 11) / 100;
  const inflation = (i.inflationPct ?? 2.5) / 100;
  const target = i.target ?? ASFA_SINGLE_TARGET;
  const iterations = i.iterations ?? 500;

  const years = Array.from({ length: yearsToRetire + 1 }, (_, k) => k);
  const paths: number[][] = [];
  let hits = 0;
  for (let it = 0; it < iterations; it++) {
    const path: number[] = [i.superBalance];
    let bal = i.superBalance;
    let inc = i.annualIncome;
    for (let y = 1; y <= yearsToRetire; y++) {
      const r = mu + sigma * randn();
      const contrib = inc * contribRate;
      bal = bal * (1 + r) + contrib;
      inc = inc * (1 + inflation);
      path.push(bal);
    }
    paths.push(path);
    // Discount final to today's dollars and compare to target (also in today's $)
    const real = path[path.length - 1] / Math.pow(1 + inflation, yearsToRetire);
    if (real >= target) hits += 1;
  }

  const pct = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b);
    const idx = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)));
    return s[idx];
  };

  const median: number[] = [];
  const p10: number[] = [];
  const p90: number[] = [];
  for (let y = 0; y <= yearsToRetire; y++) {
    const col = paths.map((p) => p[y]);
    median.push(pct(col, 50));
    p10.push(pct(col, 10));
    p90.push(pct(col, 90));
  }
  const finalMedianReal = median[median.length - 1] / Math.pow(1 + inflation, yearsToRetire);

  return {
    years,
    median,
    p10,
    p90,
    targetReal: target,
    probOfHittingTarget: hits / iterations,
    shortfallReal: finalMedianReal - target,
  };
}