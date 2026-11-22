import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/api";
import { getCategoryGroups, type CategoryGroup } from "@/lib/transactions-depth.functions";
import { getReportTransactions } from "../reports/api";

/**
 * A row from GET /api/v1/reports/transactions (only the user's own rows; the
 * server filters by user_id). Same row fields as GET /api/v1/transactions.
 */
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
  /** The server stopped at its 20,000-row cap for this range. */
  truncated: boolean;
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

/**
 * Transactions for one date range (at most 3 years; see fetchRange in
 * shared/transactions-list.mjs) plus account names and the category taxonomy.
 * Changing the range refetches; reload() refetches the current range (after an
 * add, a category change or a detail edit). A response for an older request
 * never overwrites a newer one.
 */
export function useTransactionsData(from: string, to: string) {
  const [data, setData] = useState<TransactionsData>({
    rows: [], truncated: false, accounts: new Map(), groups: [], loading: true, error: null,
  });
  const range = useRef({ from, to });
  range.current = { from, to };
  const seq = useRef(0);
  const inflight = useRef<AbortController | null>(null);

  const loadRows = useCallback(async () => {
    const id = ++seq.current;
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    const { from: f, to: t } = range.current;
    try {
      const res = await getReportTransactions(f, t, ac.signal);
      if (id !== seq.current) return;
      setData((d) => ({ ...d, rows: res.transactions as Txn[], truncated: res.truncated, loading: false, error: null }));
    } catch (err: any) {
      if (id !== seq.current || err?.name === "AbortError") return;
      setData((d) => ({ ...d, loading: false, error: err?.message || "Couldn’t load your transactions." }));
    }
  }, []);

  // Account names and the taxonomy don't depend on the range, so load them once.
  useEffect(() => {
    void Promise.allSettled([loadAccountNames(), getCategoryGroups()]).then(([acc, grp]) => {
      setData((d) => ({
        ...d,
        accounts: acc.status === "fulfilled" ? acc.value : d.accounts,
        groups: grp.status === "fulfilled" ? grp.value : d.groups,
      }));
    });
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows, from, to]);
  useEffect(() => () => inflight.current?.abort(), []);

  return { ...data, reload: loadRows };
}
