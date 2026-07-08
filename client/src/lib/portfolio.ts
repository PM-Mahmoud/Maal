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
};

export async function fetchPortfolio(): Promise<Portfolio> {
  const [income, sup, inv, prop, cash, debts, profile] = await Promise.all([
    supabase.from("incomes").select("annual_amount"),
    supabase.from("super_accounts").select("balance"),
    supabase.from("investments").select("value"),
    supabase.from("properties").select("value, mortgage_balance"),
    supabase.from("cash_accounts").select("balance"),
    supabase.from("debts").select("balance"),
    fetchProfile(),
  ]);
  const sum = <T extends Record<string, any>>(rows: T[] | null, key: keyof T) =>
    (rows ?? []).reduce((a, r) => a + Number(r[key] ?? 0), 0);
  // Age comes from the real profile endpoint (derived server-side from age_band).
  const age = profile?.age ?? 35;
  return {
    income: sum(income.data, "annual_amount"),
    superBalance: sum(sup.data, "balance"),
    investments: sum(inv.data, "value"),
    property: sum(prop.data, "value"),
    propertyDebt: sum(prop.data, "mortgage_balance"),
    cash: sum(cash.data, "balance"),
    otherDebt: sum(debts.data, "balance"),
    age,
  };
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

export async function snapshotScore(userId: string, p: Portfolio) {
  const { total, netWorth, pillars } = scoreFromPortfolio(p);
  await supabase.from("score_snapshots").insert({
    user_id: userId,
    total,
    net_worth: netWorth,
    pillars: pillars as any,
  });
}