export type Allocation = { class: string; pct: number; etf: string; ticker: string; ethical: boolean };
export type PlanInput = { age: number; risk: "conservative"|"balanced"|"growth"; ethics: "none"|"esg"|"islamic" };

const ETHICAL = {
  none: { au: { etf: "Vanguard Australian Shares", ticker: "VAS" }, intl: { etf: "Vanguard MSCI Intl", ticker: "VGS" }, bond: { etf: "iShares Govt Bond", ticker: "IGB" } },
  esg: { au: { etf: "Vanguard Ethically Conscious AU", ticker: "VETH" }, intl: { etf: "Vanguard Ethically Conscious Intl", ticker: "VESG" }, bond: { etf: "BetaShares Sustainability Bond", ticker: "GBND" } },
  islamic: { au: { etf: "Hejaz Islamic Australia", ticker: "ISLM" }, intl: { etf: "Wahed FTSE USA Shariah", ticker: "HLAL" }, bond: { etf: "Sukuk (cash-equivalent)", ticker: "CASH" } },
} as const;

export function buildPlan(p: PlanInput): Allocation[] {
  // Glide path: bonds increase with age, growth tilts with risk
  const bondBase = Math.min(40, Math.max(10, (p.age - 25)));
  const bonds = p.risk === "conservative" ? bondBase + 15 : p.risk === "growth" ? Math.max(5, bondBase - 15) : bondBase;
  const equity = 100 - bonds;
  const au = Math.round(equity * 0.4);
  const intl = equity - au;
  const set = ETHICAL[p.ethics];
  const ethical = p.ethics !== "none";
  return [
    { class: "Australian Shares", pct: au, etf: set.au.etf, ticker: set.au.ticker, ethical },
    { class: "International Shares", pct: intl, etf: set.intl.etf, ticker: set.intl.ticker, ethical },
    { class: "Bonds / Defensive", pct: bonds, etf: set.bond.etf, ticker: set.bond.ticker, ethical },
  ];
}