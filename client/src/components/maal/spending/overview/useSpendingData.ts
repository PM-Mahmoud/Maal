import { useCallback, useEffect, useState } from "react";
import { listTransactions } from "@/lib/transactions.functions";
import { getBudgets, getSpendingSettings, type Budget, type SpendingSettings } from "../settings/api";

export type SpendTxn = {
  id?: string | number;
  description?: string;
  merchant?: string;
  amount?: number | string;
  post_date?: string;
  category?: string;
  category_group?: string;
  relationship_type?: string;
  institution?: string;
};

/** A row from GET /api/v1/transactions/recurring (services/transaction-rules.js). */
export type Recurring = {
  kind: "income" | "subscription" | "bill";
  merchant: string;
  averageAmount: number;
  cadence: "weekly" | "fortnightly" | "monthly" | "yearly";
  nextEstimate: string;
  lastDate?: string;
};

async function listRecurring(): Promise<Recurring[]> {
  const r = await fetch("/api/v1/transactions/recurring", { credentials: "include" });
  if (!r.ok) throw new Error("Couldn't load recurring payments");
  const j = await r.json().catch(() => null);
  return Array.isArray(j?.recurring) ? j.recurring : [];
}

export type SpendingData = {
  transactions: SpendTxn[];
  settings: SpendingSettings | null;
  budgets: Budget[];
  recurring: Recurring[];
  loading: boolean;
  /** Sections that failed to load (never silently shown as $0). */
  errors: { transactions?: boolean; settings?: boolean; budgets?: boolean; recurring?: boolean };
};

/** Everything the Spending overview reads, all from existing endpoints. */
export function useSpendingData() {
  const [data, setData] = useState<SpendingData>({
    transactions: [], settings: null, budgets: [], recurring: [], loading: true, errors: {},
  });

  const load = useCallback(async () => {
    const [txn, set, bud, rec] = await Promise.allSettled([
      listTransactions(), getSpendingSettings(), getBudgets(), listRecurring(),
    ]);
    setData({
      transactions: txn.status === "fulfilled" ? (txn.value as SpendTxn[]) : [],
      settings: set.status === "fulfilled" ? set.value : null,
      budgets: bud.status === "fulfilled" ? bud.value.budgets : [],
      recurring: rec.status === "fulfilled" ? rec.value : [],
      loading: false,
      errors: {
        transactions: txn.status === "rejected",
        settings: set.status === "rejected",
        budgets: bud.status === "rejected",
        recurring: rec.status === "rejected",
      },
    });
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { ...data, reload: load };
}
