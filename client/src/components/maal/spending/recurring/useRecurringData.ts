import { useCallback, useEffect, useState } from "react";
import { listTransactions } from "@/lib/transactions.functions";
import { listRecurring, type RecurringItem } from "./api";

export type RecurringTxn = {
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

export type RecurringData = {
  items: RecurringItem[];
  transactions: RecurringTxn[];
  loading: boolean;
  /** Sections that failed (shown as errors, never as $0). */
  errors: { recurring?: boolean; transactions?: boolean; manual?: boolean };
};

/** Recurring page data: merged recurring items + transactions (for the add picker and card repayments). */
export function useRecurringData() {
  const [data, setData] = useState<RecurringData>({ items: [], transactions: [], loading: true, errors: {} });

  const load = useCallback(async () => {
    const [rec, txn] = await Promise.allSettled([listRecurring(), listTransactions()]);
    setData({
      items: rec.status === "fulfilled" ? rec.value.items : [],
      transactions: txn.status === "fulfilled" ? (txn.value as RecurringTxn[]) : [],
      loading: false,
      errors: {
        recurring: rec.status === "rejected",
        transactions: txn.status === "rejected",
        manual: rec.status === "fulfilled" && rec.value.manualError,
      },
    });
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { ...data, reload: load };
}
