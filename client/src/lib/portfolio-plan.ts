export type Allocation = { class: string; pct: number; etf: string; ticker: string };
export type PlanInput = { age: number; risk: "conservative"|"balanced"|"growth"|"high-growth" };

// Standard low-cost, broadly diversified AU/global ETFs used across mainstream risk bands.
const FUNDS = {
  au: { etf: "Vanguard Australian Shares", ticker: "VAS" },
  intl: { etf: "Vanguard MSCI Intl", ticker: "VGS" },
  bond: { etf: "Vanguard Australian Fixed Interest", ticker: "VAF" },
  cash: { etf: "Betashares AU High Interest Cash", ticker: "AAA" },
} as const;

export function buildPlan(p: PlanInput): Allocation[] {
  // Glide path: defensive weight increases with age; growth tilts with risk band.
  const bondBase = Math.min(40, Math.max(10, (p.age - 25)));
  const defensive =
    p.risk === "conservative" ? bondBase + 20 :
    p.risk === "balanced" ? bondBase :
    p.risk === "growth" ? Math.max(5, bondBase - 15) :
    Math.max(0, bondBase - 25); // high-growth
  const equity = 100 - defensive;
  const au = Math.round(equity * 0.4);
  const intl = equity - au;
  // Split defensive into bonds + a small cash buffer for the lower-risk bands.
  const cash = defensive >= 25 ? Math.round(defensive * 0.25) : 0;
  const bonds = defensive - cash;

  const rows: Allocation[] = [
    { class: "Australian Shares", pct: au, etf: FUNDS.au.etf, ticker: FUNDS.au.ticker },
    { class: "International Shares", pct: intl, etf: FUNDS.intl.etf, ticker: FUNDS.intl.ticker },
    { class: "Bonds / Fixed Interest", pct: bonds, etf: FUNDS.bond.etf, ticker: FUNDS.bond.ticker },
  ];
  if (cash > 0) rows.push({ class: "Cash", pct: cash, etf: FUNDS.cash.etf, ticker: FUNDS.cash.ticker });
  return rows;
}
