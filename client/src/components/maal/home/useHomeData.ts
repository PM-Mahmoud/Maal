import { useCallback, useEffect, useState } from "react";
import { handleUnauthenticated, supabase } from "@/integrations/api";
import { fetchProfile } from "@/lib/profile";
import { fetchSnapshots, type Snapshot } from "@/lib/snapshots";
import { listTransactions } from "@/lib/transactions.functions";
import { fetchMaalScore, type MaalScore } from "@/lib/maalScore";
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

export type HomeEstimates = {
  cashRunwayMonths: number | null;
  taxImpact: { fiscalYear: string; total: number | null };
};

export type HomeData = {
  name: string;
  accounts: HomeAccount[];
  investmentRows: Array<Record<string, any>>;
  snapshots: Snapshot[];
  transactions: Txn[];
  score: MaalScore | null;
  estimates: HomeEstimates | null;
  /** Sections that failed to load (never silently shown as $0). */
  errors: { accounts?: boolean; history?: boolean; transactions?: boolean; score?: boolean; estimates?: boolean };
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

async function fetchHomeEstimates(): Promise<HomeEstimates> {
  const response = await fetch("/api/v1/home-insights", { credentials: "include" });
  if (response.status === 401) handleUnauthenticated();
  if (!response.ok) throw new Error("Estimate request failed.");
  const estimates = await response.json() as HomeEstimates | null;
  if (!estimates?.taxImpact) throw new Error("Estimate response is incomplete.");
  return estimates;
}

/** Everything the Home page reads, from the existing endpoints. */
export function useHomeData() {
  const [data, setData] = useState<HomeData>({
    name: "", accounts: [], investmentRows: [], snapshots: [], transactions: [], score: null, estimates: null,
    errors: {}, loading: true, refreshedAt: null,
  });

  const load = useCallback(async () => {
    setData((d) => ({ ...d, loading: true }));
    const [userRes, profRes, accRes, snapRes, txnRes, scoreRes, estimateRes] = await Promise.allSettled([
      supabase.auth.getUser(),
      fetchProfile(),
      loadAccounts(),
      fetchSnapshots(3660),
      listTransactions(),
      fetchMaalScore(),
      fetchHomeEstimates(),
    ]);
    const prof = profRes.status === "fulfilled" ? profRes.value : null;
    const email = userRes.status === "fulfilled" ? userRes.value.data?.user?.email : "";
    const acc = accRes.status === "fulfilled" ? accRes.value : null;
    setData({
      name: prof?.display_name || (email ? email.split("@")[0] : ""),
      accounts: acc?.accounts ?? [],
      investmentRows: acc?.investmentRows ?? [],
      snapshots: snapRes.status === "fulfilled" ? snapRes.value : [],
      transactions: txnRes.status === "fulfilled" ? (txnRes.value as Txn[]) : [],
      score: scoreRes.status === "fulfilled" ? scoreRes.value : null,
      estimates: estimateRes.status === "fulfilled" ? estimateRes.value : null,
      errors: {
        accounts: !acc || acc.failed,
        history: snapRes.status === "rejected",
        transactions: txnRes.status === "rejected",
        score: scoreRes.status === "rejected",
        estimates: estimateRes.status === "rejected",
      },
      loading: false,
      refreshedAt: new Date(),
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { ...data, reload: load };
}
