import { supabase } from "@/integrations/api";
import { computeMaalScore, type ScoreInputs } from "@/lib/score";
import { fetchProfile } from "@/lib/profile";

export type Portfolio = {
  income: number;
  superBalance: number;
  investments: number;
  property: number;
  propertyDebt: number;
  cash: number;
  otherDebt: number;
  age: number;
  updatedAt?: string;
  provenance?: {
    netWorth: "calculated";
    assets: "manual" | "connected" | "mixed";
    investments: "manual" | "connected" | "mixed";
    cash: "manual" | "connected" | "mixed";
    debts: "manual" | "connected" | "mixed";
  };
  /**
   * Tables that failed to load. Present ONLY when the portfolio is partial —
   * a failed query contributes nothing rather than silently reading as $0, so
   * consumers rendering dollar figures or a Maal Score should check this and
   * surface an unavailable/partial-data state instead of an understated total.
   */
  errors?: string[];
};

// Structural match for the QueryBuilder union result in integrations/api.ts.
type TableResult = {
  data: Record<string, any>[] | Record<string, any> | null;
  error: { message: string } | null;
};

export async function fetchPortfolio(): Promise<Portfolio> {
  const [income, sup, inv, prop, cash, debts, profile] = await Promise.all([
    supabase.from("incomes").select("annual_amount, updated_at"),
    supabase.from("super_accounts").select("balance, source, updated_at"),
    supabase.from("investments").select("value, source, updated_at"),
    supabase.from("properties").select("value, mortgage_balance, source, updated_at"),
    supabase.from("cash_accounts").select("balance, source, updated_at"),
    supabase.from("debts").select("balance, source, updated_at"),
    fetchProfile(),
  ]);

  const errors: string[] = [];
  // Inspect each response's error BEFORE aggregating — a failed table query
  // must not silently become $0 in net worth.
  const rowsOf = (res: TableResult, table: string): Record<string, any>[] => {
    if (res.error) {
      errors.push(`${table}: ${res.error.message}`);
      return [];
    }
    return Array.isArray(res.data) ? res.data : [];
  };
  const sum = (rows: Record<string, any>[], key: string) =>
    rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

  const incomeRows = rowsOf(income, "incomes");
  const superRows = rowsOf(sup, "super_accounts");
  const investmentRows = rowsOf(inv, "investments");
  const propRows = rowsOf(prop, "properties");
  const cashRows = rowsOf(cash, "cash_accounts");
  const debtRows = rowsOf(debts, "debts");
  const sourceOf = (rows: Record<string, any>[]): "manual" | "connected" | "mixed" => {
    const values = new Set(rows.map((row) => row.source === "basiq" ? "connected" : "manual"));
    return values.size > 1 ? "mixed" : values.has("connected") ? "connected" : "manual";
  };
  const combinedSource = (...groups: Record<string, any>[][]) => sourceOf(groups.flat());
  const timestamps = [incomeRows, superRows, investmentRows, propRows, cashRows, debtRows]
    .flat()
    .map((row) => new Date(row.updated_at || 0))
    .filter((date) => Number.isFinite(date.getTime()));
  if (!profile) errors.push("profile: unavailable");
  // Age comes from the real profile endpoint (derived server-side from age_band).
  const age = profile?.age ?? 35;

  const portfolio: Portfolio = {
    income: sum(incomeRows, "annual_amount"),
    superBalance: sum(superRows, "balance"),
    investments: sum(investmentRows, "value"),
    property: sum(propRows, "value"),
    propertyDebt: sum(propRows, "mortgage_balance"),
    cash: sum(cashRows, "balance"),
    otherDebt: sum(debtRows, "balance"),
    age,
    provenance: {
      netWorth: "calculated",
      assets: combinedSource(investmentRows, superRows, propRows, cashRows),
      investments: combinedSource(investmentRows, superRows),
      cash: sourceOf(cashRows),
      debts: combinedSource(propRows, debtRows),
    },
  };
  // Use the oldest constituent timestamp as the conservative freshness signal:
  // one recently edited account must not make older balances look fresh.
  if (timestamps.length) portfolio.updatedAt = new Date(Math.min(...timestamps.map((date) => date.getTime()))).toISOString();
  if (errors.length) portfolio.errors = errors;
  return portfolio;
}

export function portfolioToScoreInputs(p: Portfolio): ScoreInputs {
  return {
    age: p.age,
    income: p.income,
    assets: p.superBalance + p.investments + p.property + p.cash,
    debts: p.propertyDebt + p.otherDebt,
    superBalance: p.superBalance,
  };
}

export function scoreFromPortfolio(p: Portfolio) {
  return computeMaalScore(portfolioToScoreInputs(p));
}

// NOTE: the old snapshotScore() was removed. It wrote to a `score_snapshots`
// table that never existed (via the generic API) and was never called. Daily
// score history is now recorded SERVER-SIDE in maal_score_snapshots by
// GET /api/v1/score, so the client can't fabricate its own score history.
