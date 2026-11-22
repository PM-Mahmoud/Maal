import { useCallback, useEffect, useState } from "react";
import { listTransactions } from "@/lib/transactions.functions";
import { getBudgets, getSpendingSettings, type Budget, type SpendingSettings } from "../settings/api";
import type { SpendTxn } from "../overview/useSpendingData";
import { getSpendingCategories, type CategoryGroupDef, type CustomCategory } from "./api";

export type BreakdownData = {
  transactions: SpendTxn[];
  settings: SpendingSettings | null;
  budgets: Budget[];
  custom: CustomCategory[];
  groups: CategoryGroupDef[];
  loading: boolean;
  /** Sections that failed (never shown as $0). */
  errors: { transactions?: boolean; budgets?: boolean; categories?: boolean };
};

/** Everything Breakdown & budget reads. `reload(part)` refreshes one part after an edit. */
export function useBreakdownData() {
  const [data, setData] = useState<BreakdownData>({
    transactions: [], settings: null, budgets: [], custom: [], groups: [], loading: true, errors: {},
  });

  const load = useCallback(async () => {
    const [txn, set, bud, cat] = await Promise.allSettled([
      listTransactions(), getSpendingSettings(), getBudgets(), getSpendingCategories(),
    ]);
    setData({
      transactions: txn.status === "fulfilled" ? (txn.value as SpendTxn[]) : [],
      settings: set.status === "fulfilled" ? set.value : null,
      budgets: bud.status === "fulfilled" ? bud.value.budgets : [],
      custom: cat.status === "fulfilled" ? cat.value.categories : [],
      groups: cat.status === "fulfilled" ? cat.value.groups : [],
      loading: false,
      errors: {
        transactions: txn.status === "rejected",
        budgets: bud.status === "rejected",
        categories: cat.status === "rejected",
      },
    });
  }, []);

  const reloadBudgets = useCallback(async () => {
    try {
      const b = await getBudgets();
      setData((d) => ({ ...d, budgets: b.budgets, errors: { ...d.errors, budgets: false } }));
    } catch {
      setData((d) => ({ ...d, errors: { ...d.errors, budgets: true } }));
    }
  }, []);

  const reloadCategories = useCallback(async () => {
    try {
      const c = await getSpendingCategories();
      setData((d) => ({ ...d, custom: c.categories, groups: c.groups, errors: { ...d.errors, categories: false } }));
    } catch {
      setData((d) => ({ ...d, errors: { ...d.errors, categories: true } }));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { ...data, reload: load, reloadBudgets, reloadCategories };
}
