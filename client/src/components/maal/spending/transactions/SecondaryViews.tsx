import { useEffect, useMemo, useState } from "react";
import {
  createReconciliationAdjustment, getReconciliationAdjustments, getReconciliations, getRecurringTransactions,
  type Reconciliation, type ReconciliationAdjustment, type RecurringTransaction,
} from "@/lib/transactions-depth.functions";
import { audCents } from "@/components/maal/home/format";
import { TxDialog } from "./TxDrawer";

// Recurring payments and account reconciliation, kept from the old page and
// moved behind the "More" menu. Same endpoints and behaviour as before.

const PER_MONTH: Record<string, number> = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, yearly: 1 / 12 };

export function RecurringView({ version }: { version: number }) {
  const [subs, setSubs] = useState<RecurringTransaction[] | null>(null);
  useEffect(() => { setSubs(null); getRecurringTransactions().then(setSubs); }, [version]);
  const monthly = useMemo(
    () => (subs || []).filter((s) => s.kind !== "income").reduce((a, s) => a + s.averageAmount * (PER_MONTH[s.cadence] ?? 1), 0),
    [subs],
  );
  if (subs === null) return <div className="tx-pad"><div className="mh-skel" style={{ height: 160 }} /></div>;
  if (subs.length === 0) {
    return <p className="mh-empty tx-pad">No recurring activity found yet. Connect an account or import transactions to spot income, bills and subscriptions.</p>;
  }
  return (
    <div>
      <p className="tx-sub-summary">
        {subs.length} recurring payment{subs.length === 1 ? "" : "s"} · about <strong className="mh-amount">{audCents(monthly)}</strong> a month going out
      </p>
      <ul className="tx-simple-list">
        {subs.map((s, i) => (
          <li key={`${s.merchant}-${i}`}>
            <span className="min-w-0 flex-1">
              <span className="tx-name">{s.merchant}</span>
              <span className="tx-meta">
                <span className="capitalize">{s.kind}</span> · <span className="capitalize">{s.cadence}</span>
                {s.nextEstimate ? ` · next around ${s.nextEstimate}` : ""} · {s.occurrences} times
              </span>
            </span>
            <span className="tx-amt mh-amount">
              {audCents(s.averageAmount)}
              <span className="tx-meta">{audCents(s.minAmount)} – {audCents(s.maxAmount)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReconcileView() {
  const [items, setItems] = useState<Reconciliation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, ReconciliationAdjustment[]>>({});
  const [adjusting, setAdjusting] = useState<Reconciliation | null>(null);
  const [form, setForm] = useState({ amount: "", reason: "", effective_at: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);

  useEffect(() => { getReconciliations().then(setItems).catch((e) => setError(e?.message || "Couldn’t load reconciliation.")); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    setBusy(true);
    setError(null);
    try {
      await createReconciliationAdjustment(adjusting.account_reference, {
        amount: Number(form.amount), reason: form.reason, effective_at: form.effective_at,
      });
      const [next, h] = await Promise.all([getReconciliations(), getReconciliationAdjustments(adjusting.account_reference)]);
      setItems(next);
      setHistory((c) => ({ ...c, [adjusting.account_reference]: h }));
      setAdjusting(null);
    } catch (err: any) {
      setError(err?.message ?? "Couldn’t save the adjustment.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !items) return <p className="tx-error tx-pad" role="alert">{error}</p>;
  if (items === null) return <div className="tx-pad"><div className="mh-skel" style={{ height: 120 }} /></div>;
  return (
    <div className="tx-pad tx-stack">
      {error && <p className="tx-error" role="alert">{error}</p>}
      {items.length === 0 && <p className="mh-empty">No connected accounts are ready to reconcile yet.</p>}
      {items.map((item) => {
        const diff = Number(item.difference);
        const h = history[item.account_reference] ?? [];
        return (
          <div key={item.account_reference} className="tx-recon">
            <div className="tx-recon-top">
              <div className="min-w-0">
                <p className="tx-name">Account ••{item.account_reference.replace(/^basiq:/, "").slice(-4)}</p>
                <p className="tx-meta mh-amount">
                  Bank {item.provider_balance == null ? "not reported" : audCents(Number(item.provider_balance))} · Calculated{" "}
                  {item.adjusted_balance == null && item.calculated_balance == null ? "not available" : audCents(Number(item.adjusted_balance ?? item.calculated_balance))}
                </p>
              </div>
              <span className="tx-pill" data-tone={item.status === "matched" ? "good" : "warn"}>{item.status.replace("_", " ")}</span>
            </div>
            {item.status === "mismatch" && Number.isFinite(diff) && (
              <div className="tx-recon-foot">
                <p className="m-0">Difference: <strong className="mh-amount">{audCents(diff)}</strong></p>
                <button type="button" className="tx-btn-sm" onClick={() => {
                  setAdjusting(item);
                  setForm({ amount: String(diff), reason: "", effective_at: new Date().toISOString().slice(0, 10) });
                }}>Add adjustment</button>
              </div>
            )}
            {Number(item.adjustment_total) !== 0 && (
              <button type="button" className="tx-link tx-small" onClick={async () => {
                const list = await getReconciliationAdjustments(item.account_reference);
                setHistory((c) => ({ ...c, [item.account_reference]: c[item.account_reference]?.length ? [] : list }));
              }}>{h.length ? "Hide" : "View"} adjustment history</button>
            )}
            {h.map((entry) => (
              <p key={entry.id} className="tx-meta">{entry.effective_at}: <span className="mh-amount">{audCents(Number(entry.amount))}</span> · {entry.reason}</p>
            ))}
          </div>
        );
      })}

      <TxDialog open={Boolean(adjusting)} onOpenChange={(o) => { if (!o) setAdjusting(null); }} title="Reconcile account difference">
        <form onSubmit={submit} className="tx-form">
          <p className="tx-muted tx-small m-0">Adjustments create a permanent audit entry. To correct one later, add an equal reversing adjustment.</p>
          <label className="tx-field">
            <span className="tx-field-label">Adjustment amount</span>
            <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label className="tx-field">
            <span className="tx-field-label">Effective date</span>
            <input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.effective_at} onChange={(e) => setForm({ ...form, effective_at: e.target.value })} />
          </label>
          <label className="tx-field">
            <span className="tx-field-label">Reason</span>
            <textarea required minLength={3} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <div className="tx-foot-row">
            <button type="button" className="tx-btn-line" onClick={() => setAdjusting(null)}>Cancel</button>
            <button type="submit" className="tx-btn-ink" disabled={busy}>{busy ? "Saving…" : "Save adjustment"}</button>
          </div>
        </form>
      </TxDialog>
    </div>
  );
}
