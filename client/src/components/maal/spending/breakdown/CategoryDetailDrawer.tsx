import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { countsAsSpend, groupOf, shiftMonth, txnDay } from "../../../../../../shared/spending-overview.mjs";
import {
  availableForCategory, categoryHistory, firstDataKey, historyStats, monthKey,
} from "../../../../../../shared/spending-breakdown.mjs";
import { aud, audCents, shortDate } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import { saveBudget, type Budget } from "../settings/api";
import type { SpendTxn } from "../overview/useSpendingData";
import { openTransactionDetail } from "../transaction-detail/TransactionDetailMount";
import { deleteBudget, type CustomCategory } from "./api";
import { CatIcon, ErrorLine, monthLabel, Toast } from "./parts";
import "../settings/spending-settings.css";

const BARS = 6;

/**
 * Category detail drawer (HEL-85) with "Set a budget" inline (HEL-88):
 * the category's budget, last month + monthly average, six months of spend as
 * monochrome bars (pick one to list its transactions), and the transactions,
 * each opening the transaction detail.
 */
export function CategoryDetailDrawer({ name, transactions, excluded, budgets, custom, today, onClose, onBudgetChanged }: {
  name: string;
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  budgets: Budget[];
  custom: CustomCategory[];
  today: Date;
  onClose: () => void;
  onBudgetChanged: () => Promise<void> | void;
}) {
  const privacy = usePrivacy();
  const curKey = monthKey(today.getFullYear(), today.getMonth());
  const [back, setBack] = useState(0);
  const end = shiftMonth(today.getFullYear(), today.getMonth(), back);
  const [picked, setPicked] = useState(curKey);
  const [sort, setSort] = useState<"newest" | "oldest" | "largest">("newest");
  const history = useMemo(() => categoryHistory(transactions, name, end.year, end.month, BARS, excluded), [transactions, name, end.year, end.month, excluded]);
  const statsHistory = useMemo(() => categoryHistory(transactions, name, today.getFullYear(), today.getMonth(), 7, excluded), [transactions, name, today, excluded]);
  const stats = historyStats(statsHistory, curKey, firstDataKey(transactions));
  const max = Math.max(1, ...history.map((h) => h.amount));
  const list = useMemo(() => {
    const rows = transactions.filter((t) => groupOf(t) === name && countsAsSpend(t, excluded) && txnDay(t)?.slice(0, 7) === picked);
    return rows.sort((a, b) => sort === "largest" ? Number(a.amount) - Number(b.amount)
      : sort === "oldest" ? String(txnDay(a)).localeCompare(String(txnDay(b))) : String(txnDay(b)).localeCompare(String(txnDay(a))));
  }, [transactions, name, excluded, picked, sort]);

  const budget = budgets.find((b) => b.category_group === name) || null;
  const thisMonth = statsHistory[statsHistory.length - 1]?.amount ?? 0;
  const available = availableForCategory(budgets, name);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [py, pm] = picked.split("-").map(Number);

  function startEdit() {
    setAmount(budget ? String(budget.monthly_amount) : "");
    setErr(null);
    setEditing(true);
  }
  async function save() {
    setBusy(true); setErr(null);
    try {
      await saveBudget({ category_group: name, monthly_amount: amount });
      await onBudgetChanged();
      setEditing(false);
      setToast(budget ? "Budget updated" : "New budget created");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!budget) return;
    setBusy(true); setErr(null);
    try {
      await deleteBudget(budget.id);
      await onBudgetChanged();
      setToast("Budget removed");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const n = Number(String(amount).replace(/[$,\s]/g, ""));
  const valid = Number.isFinite(n) && n > 0;
  const left = budget ? Math.round((Number(budget.monthly_amount) - thisMonth) * 100) / 100 : 0;
  const usedPct = budget ? Math.min(100, (thisMonth / Number(budget.monthly_amount)) * 100) : 0;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ss-scrim" />
        <DialogPrimitive.Content className="mh-shell ss-drawer bd-drawer" aria-describedby={undefined}>
          <header className="ss-head">
            <DialogPrimitive.Title className="ss-eyebrow">Category detail</DialogPrimitive.Title>
            <DialogPrimitive.Close className="ss-iconbtn ss-close" aria-label="Close category detail"><X aria-hidden /></DialogPrimitive.Close>
          </header>
          {toast && <Toast title={toast} onClose={() => setToast(null)} />}
          <div className="ss-body">
            <section className="ss-card">
              <div className="bd-dhead"><CatIcon name={name} custom={custom} size={28} /><h2 className="bd-dname">{name}</h2></div>
              <div className="bd-dbudget">
                {editing ? (
                  <form className="bd-bform" onSubmit={(e) => { e.preventDefault(); if (valid) void save(); }}>
                    <div className="bd-bform-row">
                      <label className="bd-field">
                        <span>Monthly budget from {monthLabel(today.getFullYear(), today.getMonth(), "long").split(" ")[0]}</span>
                        <span className="bd-field-in">$<input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Monthly budget for ${name}`} /></span>
                      </label>
                      <button type="submit" className="ss-btn-sm ss-btn-ink" disabled={!valid || busy}>{busy ? "Saving…" : "Save"}</button>
                      <button type="button" className="ss-iconbtn" onClick={() => setEditing(false)} aria-label="Cancel"><X aria-hidden /></button>
                    </div>
                    {available !== null && (
                      <p className="mh-muted mh-small m-0">Left in your monthly budget for this category: <span className="mh-amount">{aud(Math.max(0, available))}</span>
                        {valid && available !== null && n > available && <span className="bd-warn-text"> · this is more than what’s left</span>}
                      </p>
                    )}
                    <p className="mh-muted mh-small m-0">Budgets repeat every month until you change them.</p>
                  </form>
                ) : budget ? (
                  <div className="bd-dbrow">
                    <span className="bd-ring" style={{ ["--p" as string]: `${usedPct}%` }} aria-hidden><span>{Math.round(usedPct)}%</span></span>
                    <span className="flex-1 min-w-0">
                      {left >= 0 ? <><span className="mh-amount">{aud(left)}</span> left to spend of a <span className="mh-amount">{aud(Number(budget.monthly_amount))}</span> budget</>
                        : <><span className="mh-amount">{aud(-left)}</span> over a <span className="mh-amount">{aud(Number(budget.monthly_amount))}</span> budget</>}
                    </span>
                    <button type="button" className="ss-iconbtn" onClick={startEdit} aria-label="Edit budget"><Pencil aria-hidden /></button>
                    <button type="button" className="ss-iconbtn" onClick={remove} disabled={busy} aria-label="Remove budget"><Trash2 aria-hidden /></button>
                  </div>
                ) : (
                  <button type="button" className="ss-row" onClick={startEdit}>Set a budget <Pencil className="ss-chev" aria-hidden /></button>
                )}
                {err && <ErrorLine>{err}</ErrorLine>}
              </div>
            </section>

            <dl className="ss-card bd-dstats">
              <div><dt>Spent last month</dt><dd className="mh-amount">{aud(stats.lastMonth)}</dd></div>
              <div><dt>Monthly average</dt><dd className="mh-amount">{stats.months ? aud(stats.average) : "—"}</dd></div>
            </dl>

            <div className="bd-hist">
              <button type="button" className="ss-iconbtn bd-hist-nav" onClick={() => setBack((b) => b + BARS)} aria-label="Earlier months"><ChevronLeft aria-hidden /></button>
              <div className="bd-hist-cols" role="group" aria-label={`${name} spending by month`}>
                {history.map((h) => {
                  const ht = h.amount > 0 ? Math.max(3, (h.amount / max) * 100) : 0;
                  const sel = h.key === picked;
                  return (
                    <button key={h.key} type="button" className="bd-hcol" aria-pressed={sel} onClick={() => setPicked(h.key)}
                      aria-label={`${monthLabel(h.year, h.month)}${privacy ? "" : `: ${aud(h.amount)}`}`}>
                      <span className="bd-hplot">
                        <svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden>
                          {ht > 0 && <rect x="0.8" y={100 - ht} width="8.4" height={ht} rx="0.4" className="bd-hbar" data-sel={sel} />}
                          <line x1="0" y1="99.5" x2="10" y2="99.5" className="bd-pbase" vectorEffect="non-scaling-stroke" />
                        </svg>
                        <span className="bd-hval mh-amount" style={{ bottom: `${ht}%` }}>{aud(h.amount)}</span>
                      </span>
                      <span className="bd-plabel">{new Date(h.year, h.month).toLocaleDateString("en-AU", { month: "short" })}{h.month === 0 ? ` ’${String(h.year).slice(2)}` : ""}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="ss-iconbtn bd-hist-nav" onClick={() => setBack((b) => Math.max(0, b - BARS))} disabled={back === 0} aria-label="Later months"><ChevronRight aria-hidden /></button>
            </div>

            <div className="bd-viewby">
              <label className="mh-muted mh-small" htmlFor="bd-dsort">Sort</label>
              <span className="so-select">
                <select id="bd-dsort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="largest">Largest</option>
                </select>
                <ChevronDown aria-hidden />
              </span>
            </div>
            <section className="ss-card">
              <p className="bd-dlist-label">Transactions · {monthLabel(py, pm - 1)}</p>
              {list.length === 0 ? (
                <p className="mh-empty m-0">No {name} spending in {monthLabel(py, pm - 1)}.</p>
              ) : list.map((t) => (
                <button key={String(t.id)} type="button" className="bd-txn" onClick={() => t.id != null && openTransactionDetail(t.id)}>
                  <CatIcon name={name} custom={custom} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="bd-trunc">{t.merchant || t.description || "Transaction"}</span>
                    <span className="bd-sub">{shortDate(t.post_date)}</span>
                  </span>
                  <span className="mh-amount bd-amt">{audCents(-Number(t.amount))}</span>
                </button>
              ))}
            </section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
