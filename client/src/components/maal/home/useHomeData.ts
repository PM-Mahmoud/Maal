import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/api";
import { fetchProfile } from "@/lib/profile";
import { fetchSnapshots, type Snapshot } from "@/lib/snapshots";
import { listTransactions } from "@/lib/transactions.functions";
import { fetchMaalScore, type MaalScore } from "@/lib/maalScore";
import { homeBudgetSummary, type HomeBudgetSummary } from "../../../../../shared/home-budget.mjs";
import { getBudgets, getSpendingSettings } from "../spending/settings/api";
import { buildHomeAccounts, type HomeAccount } from "../../../../../shared/home-accounts.mjs";

export type Txn = {
  id?: string | number;
  description?: string;
  merchant?: string;
  amount?: number | string;
  post_date?: string;
  category?: string;
  category_label?: string;
  group?: string;
};

export type HomeData = {
  name: string;
  accounts: HomeAccount[];
  investmentRows: Array<Record<string, any>>;
  snapshots: Snapshot[];
  transactions: Txn[];
  score: MaalScore | null;
  budget: HomeBudgetSummary | null;
  /** Sections that failed to load (never silently shown as $0). */
  errors: { accounts?: boolean; history?: boolean; transactions?: boolean; score?: boolean; budget?: boolean };
  loading: boolean;
  refreshedAt: Date | null;
};

const TABLES = [
  ["cash", "cash_accounts"],
  ["investments", "investments"],
  ["super", "super_accounts"],
  ["properties", "properties"],
  ["debts", "debts"],
  ["other", "other_assets"],
] as const;

type TableResult = { data: unknown; error: { message: string } | null };

async function loadAccounts() {
  const results = (await Promise.all(
    TABLES.map(([, table]) => supabase.from(table).select("*")),
  )) as TableResult[];
  const rows: Record<string, Array<Record<string, any>>> = {};
  let failed = false;
  results.forEach((res, i) => {
    if (res.error) failed = true;
    rows[TABLES[i][0]] = Array.isArray(res.data) ? (res.data as Array<Record<string, any>>) : [];
  });
  return { accounts: buildHomeAccounts(rows), investmentRows: rows.investments, failed };
}

/** Everything the Home page reads, from the existing endpoints. */
export function useHomeData() {
  const [data, setData] = useState<HomeData>({
    name: "", accounts: [], investmentRows: [], snapshots: [], transactions: [], score: null, budget: null,
    errors: {}, loading: true, refreshedAt: null,
  });

  const load = useCallback(async () => {
    setData((d) => ({ ...d, loading: true }));
    const [userRes, profRes, accRes, snapRes, txnRes, scoreRes, budgetRes, settingsRes] = await Promise.allSettled([
      supabase.auth.getUser(),
      fetchProfile(),
      loadAccounts(),
      fetchSnapshots(3660),
      listTransactions(),
      fetchMaalScore(),
      getBudgets(),
      getSpendingSettings(),
    ]);
    const prof = profRes.status === "fulfilled" ? profRes.value : null;
    const email = userRes.status === "fulfilled" ? userRes.value.data?.user?.email : "";
    const acc = accRes.status === "fulfilled" ? accRes.value : null;
    const transactions = txnRes.status === "fulfilled" ? (txnRes.value as Txn[]) : [];
    const hasBudgetData = budgetRes.status === "fulfilled" && Array.isArray(budgetRes.value?.budgets)
      && txnRes.status === "fulfilled" && settingsRes.status === "fulfilled"
      && Array.isArray(settingsRes.value?.excluded_groups);
    const budget = hasBudgetData
      ? homeBudgetSummary({
          transactions, ...budgetRes.value, excluded: settingsRes.value.excluded_groups,
        })
      : null;
    setData({
      name: prof?.display_name || (email ? email.split("@")[0] : ""),
      accounts: acc?.accounts ?? [],
      investmentRows: acc?.investmentRows ?? [],
      snapshots: snapRes.status === "fulfilled" ? snapRes.value : [],
      transactions,
      budget,
      score: scoreRes.status === "fulfilled" ? scoreRes.value : null,
      errors: {
        accounts: !acc || acc.failed,
        history: snapRes.status === "rejected",
        transactions: txnRes.status === "rejected",
        score: scoreRes.status === "rejected",
        budget: !hasBudgetData,
      },
      loading: false,
      refreshedAt: new Date(),
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { ...data, reload: load };
}
