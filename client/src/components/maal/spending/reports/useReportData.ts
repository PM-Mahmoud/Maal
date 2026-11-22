import { useCallback, useEffect, useRef, useState } from "react";
import { getSpendingSettings } from "../settings/api";
import type { SpendTxn } from "../overview/useSpendingData";
import { getReportTransactions, listViews, type SavedView } from "./api";

type TxnState = { loading: boolean; error: string | null; transactions: SpendTxn[]; truncated: boolean };

/**
 * Transactions for [from, to] from the date-ranged reports endpoint. Results
 * are cached per range for the page's lifetime, so flipping between presets
 * doesn't refetch; a failure is surfaced (never shown as $0).
 */
export function useReportTransactions(from: string | null, to: string | null) {
  const cache = useRef(new Map<string, { transactions: SpendTxn[]; truncated: boolean }>());
  const [state, setState] = useState<TxnState>({ loading: true, error: null, transactions: [], truncated: false });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!from || !to) { setState({ loading: false, error: null, transactions: [], truncated: false }); return; }
    const key = `${from}|${to}`;
    const hit = cache.current.get(key);
    if (hit) { setState({ loading: false, error: null, ...hit }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    getReportTransactions(from, to, ctrl.signal)
      .then((res) => {
        cache.current.set(key, res);
        setState({ loading: false, error: null, ...res });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ loading: false, error: e instanceof Error ? e.message : "Couldn't load transactions.", transactions: [], truncated: false });
      });
    return () => ctrl.abort();
  }, [from, to, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}

/** Excluded spending groups from Spending settings; undefined → server defaults. */
export function useExcludedGroups() {
  const [excluded, setExcluded] = useState<string[] | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    getSpendingSettings()
      .then((s) => { if (live) setExcluded(s.excluded_groups); })
      .catch(() => { /* fall back to the default excluded groups */ })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return { excluded, ready };
}

/** The user's saved report views. */
export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setViews(await listViews()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load your saved reports."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { views, setViews, loading, error, reload: load };
}
