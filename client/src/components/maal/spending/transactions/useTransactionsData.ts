import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/api";
import { listTransactions } from "@/lib/transactions.functions";
import { getCategoryGroups, type CategoryGroup } from "@/lib/transactions-depth.functions";

/** A row from GET /api/v1/transactions (only the user's own rows; server filters by user_id). */
export type Txn = {
  id: string | number;
  description?: string;
  merchant?: string;
  amount?: number | string;
  post_date?: string;
  status?: string | null;
  account_reference?: string | null;
  category_group?: string | null;
  category?: string | null;
  category_source?: "manual" | "rule" | "auto" | "learned" | string | null;
  category_confidence?: number | string | null;
  relationship_type?: string | null;
  // Optional flags from the Transaction detail part (read defensively).
  hidden?: boolean;
  reviewed?: boolean;
  reviewed_at?: string | null;
};

/** What the Account column shows for an account_reference. */
export type AccountInfo = { key: string; label: string; institution: string | null; fullName?: string };

export type TransactionsData = {
  rows: Txn[];
  accounts: Map<string, AccountInfo>;
  groups: CategoryGroup[];
  loading: boolean;
  /** A failed request is an error, never an empty list. */
  error: string | null;
};

const last4 = (ref: string) => ref.replace(/^[a-z]+:/i, "").slice(-4);

/** Name an account from the user's cash accounts; unknown refs fall back to "Account ••1234". */
export function describeAccount(key: string, known: Map<string, AccountInfo>): AccountInfo {
  if (key === "manual") return { key, label: "Manual entry", institution: null };
  return known.get(key) || { key, label: `Account ••${last4(key)}`, institution: null };
}

async function loadAccountNames(): Promise<Map<string, AccountInfo>> {
  const out = new Map<string, AccountInfo>();
  try {
    const res = (await supabase.from("cash_accounts").select("*")) as { data: unknown; error: unknown };
    const rows = Array.isArray(res.data) ? (res.data as Array<Record<string, any>>) : [];
    for (const r of rows) {
      const ref = r.account_reference ? String(r.account_reference) : "";
      if (!ref) continue;
      const inst = r.institution || r.institution_name || null;
      const name = r.label || r.name || inst || "Bank account";
      out.set(ref, { key: ref, label: `${inst || name} ••${last4(ref)}`, institution: inst || name, fullName: inst && name !== inst ? `${inst} ${name} ••${last4(ref)}` : undefined });
    }
  } catch { /* names are cosmetic; the column falls back to the reference */ }
  return out;
}

/** Transactions, account names and the category taxonomy, all from existing endpoints. */
export function useTransactionsData() {
  const [data, setData] = useState<TransactionsData>({
    rows: [], accounts: new Map(), groups: [], loading: true, error: null,
  });

  const load = useCallback(async () => {
    const [txn, acc, grp] = await Promise.allSettled([listTransactions(), loadAccountNames(), getCategoryGroups()]);
    setData((d) => ({
      rows: txn.status === "fulfilled" ? (txn.value as Txn[]) : d.rows,
      accounts: acc.status === "fulfilled" ? acc.value : d.accounts,
      groups: grp.status === "fulfilled" ? grp.value : d.groups,
      loading: false,
      error: txn.status === "rejected" ? (txn.reason?.message || "Couldn’t load your transactions.") : null,
    }));
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { ...data, reload: load };
}
