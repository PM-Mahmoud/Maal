import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleDollarSign, Pencil, X } from "lucide-react";
import { budgetRows, budgetUsage, categoryBreakdown, isIncome, isoDay, projectRecurring, txnDay } from "../../../../../../shared/spending-overview.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud, shortDate, signedCents } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import { createThread } from "@/lib/advisor.functions";
import type { Budget } from "../settings/api";
import { iconForGroup } from "./categoryIcons";
import type { Recurring, SpendTxn } from "./useSpendingData";

const PROMO_KEY = "maal.spending.budgetPromoDismissed";
const readDismissed = () => { try { return localStorage.getItem(PROMO_KEY) === "1"; } catch { return false; } };

/** Starts an Ask Maal thread with a prepared question (same handoff as AskSparkButton). */
function useAskMaal() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function ask(question: string) {
    if (busy) return;
    setBusy(true);
    try {
      const thread = (await createThread()) as { id: string };
      try { localStorage.setItem(`maal_autosend_${thread.id}`, question); } catch { /* ignore */ }
      navigate({ to: "/app/advisor/$threadId", params: { threadId: thread.id } });
    } catch {
      navigate({ to: "/app/advisor" });
    } finally { setBusy(false); }
  }
  return { ask, busy };
}

/** Dismissible "Build a budget" card. Hidden once the user has a budget. */
export function BudgetPromoCard() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const { ask, busy } = useAskMaal();
  if (dismissed) return null;
  function dismiss() {
    try { localStorage.setItem(PROMO_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }
  return (
    <section className="so-promo" aria-labelledby="so-promo-title">
      <div className="so-promo-head">
        <p className="so-promo-eyebrow">New in Maal</p>
        <button type="button" className="mh-close" onClick={dismiss} aria-label="Dismiss"><X aria-hidden size={18} /></button>
      </div>
      <h2 id="so-promo-title" className="so-promo-title">Build a budget with Maal</h2>
      <p className="so-promo-text">Maal looks at what you’ve actually spent over the last few months and suggests a monthly budget you can fine-tune.</p>
      <button type="button" className="mh-btn-ink mt-4" disabled={busy}
        onClick={() => ask("Help me build a realistic monthly budget from my actual spending over the last three months. Suggest an amount for each category.")}>
        {busy ? "Opening…" : "Build my budget"}
      </button>
    </section>
  );
}

/** Grey ramp for the donut + legend: monochrome charts, strongest first. */
const RAMP = [1, 0.72, 0.5, 0.34, 0.22, 0.14, 0.09];

export function CategoryBreakdownCard({ transactions, excluded, budgets, upcoming, includeUpcoming, loading, error, budgetError, today }: {
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  budgets: Budget[];
  upcoming: number;
  includeUpcoming: boolean;
  loading: boolean;
  error?: boolean;
  budgetError?: boolean;
  today: Date;
}) {
  const [tab, setTab] = useState<"expenses" | "budget">("expenses");
  const [more, setMore] = useState(false);
  const privacy = usePrivacy();
  const breakdown = useMemo(
    () => categoryBreakdown(transactions, today.getFullYear(), today.getMonth(), excluded) as Array<{ group: string; amount: number; pct: number }>,
    [transactions, excluded, today],
  );
  const spent = breakdown.reduce((a, r) => a + r.amount, 0);
  const total = budgets.find((b) => !b.category_group)?.monthly_amount
    ?? budgets.reduce((a, b) => a + Number(b.monthly_amount || 0), 0);
  const usage = budgetUsage({ spent, budget: total, upcoming, includeUpcoming });
  const rows = useMemo(() => budgetRows(breakdown, budgets) as Array<{ group: string; spent: number; budget: number; pct: number; rest?: boolean }>, [breakdown, budgets]);

  const tabs = (
    <div className="so-tabs" role="tablist" aria-label="Category breakdown view">
      {(["expenses", "budget"] as const).map((t) => (
        <button key={t} type="button" role="tab" id={`so-cb-${t}`} aria-selected={tab === t} aria-controls="so-cb-panel"
          onClick={() => { setTab(t); setMore(false); }}>
          {t === "expenses" ? "Expenses" : "Budget"}
        </button>
      ))}
    </div>
  );

  return (
    <HomeCard label="Category breakdown" labelId="so-cat-label" className="so-cat" bodyClassName="so-cat-body"
      actions={<AskSparkButton label="Ask Maal about your categories" question="Which spending categories are biggest for me this month, and where could I realistically cut back?" />}>
      <div id="breakdown" className="so-anchor" />
      {tabs}
      <div id="so-cb-panel" role="tabpanel" aria-labelledby={`so-cb-${tab}`} className="so-cat-panel">
        {loading ? <div className="mh-skel" style={{ height: 260 }} /> : error ? (
          <p className="mh-muted mh-small m-0">Your spending couldn’t load right now.</p>
        ) : tab === "expenses" ? (
          breakdown.length === 0 ? (
            <div className="mh-empty">
              <p className="m-0">No spending yet this month. Your categories will appear here as transactions come in.</p>
            </div>
          ) : (
            <>
              <Donut rows={breakdown} total={spent} privacy={privacy} />
              <ul className="so-cat-list">
                {(more ? breakdown : breakdown.slice(0, 5)).map((r, i) => {
                  const Icon = iconForGroup(r.group);
                  return (
                    <li key={r.group} className="so-cat-row">
                      <span className="so-cat-icon" aria-hidden><Icon /></span>
                      <span className="min-w-0 flex-1">
                        <span className="so-cat-name">
                          <i className="so-swatch" style={{ opacity: RAMP[Math.min(i, RAMP.length - 1)] }} aria-hidden />{r.group}
                        </span>
                        <span className="so-cat-sub">{r.pct.toFixed(r.pct < 10 ? 1 : 0)}% of expenses</span>
                      </span>
                      <span className="so-cat-amt mh-amount">{aud(r.amount)}</span>
                    </li>
                  );
                })}
              </ul>
              {breakdown.length > 5 && (
                <button type="button" className="mh-btn-outline mh-btn-wide so-more" onClick={() => setMore((m) => !m)}>
                  {more ? "See less" : "See more"}
                </button>
              )}
            </>
          )
        ) : budgetError ? (
          <p className="mh-muted mh-small m-0">Your budget couldn’t load right now.</p>
        ) : !usage ? (
          <div className="so-budget-empty">
            <p className="so-budget-empty-title">Create your budget</p>
            <p className="mh-muted mh-small m-0">Set a monthly budget to stay on top of your spending and see how each month is tracking.</p>
            <Gauge pct={0} />
            <Link to="/app/spending/breakdown" search={{ panel: "ai" }} className="mh-btn-ink so-create">
              <Pencil aria-hidden size={15} /> Create budget
            </Link>
          </div>
        ) : (
          <>
            <div className="so-gauge-wrap">
              <Gauge pct={usage.pct} />
              <div className="so-gauge-text">
                <span className="so-gauge-pct">{usage.pct.toFixed(usage.pct < 10 ? 1 : 0)}%</span>
                <span className="so-gauge-amt mh-amount">{aud(usage.used)}</span>
                <span className="so-gauge-sub mh-amount">{aud(usage.budget)} budget</span>
              </div>
            </div>
            {includeUpcoming && upcoming > 0 && (
              <p className="mh-muted mh-small so-center m-0">Includes <span className="mh-amount">{aud(upcoming)}</span> of upcoming bills</p>
            )}
            <p className="so-center m-0 mt-2">
              <Link to="/app/spending/breakdown" search={{ panel: "edit" }} className="mh-link-btn so-edit">
                Edit budget <Pencil aria-hidden size={13} />
              </Link>
            </p>
            {rows.length > 0 && (
              <ul className="so-cat-list mt-4">
                {(more ? rows : rows.slice(0, 4)).map((r) => {
                  const Icon = r.rest ? CircleDollarSign : iconForGroup(r.group);
                  return (
                    <li key={r.group} className="so-cat-row so-brow">
                      <span className="so-cat-icon" aria-hidden><Icon /></span>
                      <span className="min-w-0 flex-1">
                        <span className="so-brow-top">
                          <span className="so-cat-name">{r.group}</span>
                          <span className="so-cat-amt mh-amount">{aud(r.spent)} <span className="mh-muted">of {aud(r.budget)}</span></span>
                        </span>
                        <span className="so-brow-bar">
                          <span className="mh-bar flex-1"><i style={{ width: `${Math.min(100, r.pct)}%` }} data-over={r.pct > 100} /></span>
                          <span className="so-cat-sub">{r.pct.toFixed(r.pct < 10 ? 1 : 0)}%</span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {rows.length > 4 && (
              <button type="button" className="mh-btn-outline mh-btn-wide so-more" onClick={() => setMore((m) => !m)}>
                {more ? "See less" : "See more"}
              </button>
            )}
          </>
        )}
      </div>
    </HomeCard>
  );
}

function Donut({ rows, total, privacy }: { rows: Array<{ group: string; amount: number }>; total: number; privacy: boolean }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="so-donut">
      <svg viewBox="0 0 180 180" role="img" aria-label={privacy ? "Spending by category" : `Spending by category: ${rows.map((x) => `${x.group} ${aud(x.amount)}`).join(", ")}`}>
        <circle cx="90" cy="90" r={r} className="so-donut-track" />
        {rows.map((row, i) => {
          const len = total > 0 ? (row.amount / total) * c : 0;
          const gap = rows.length > 1 ? Math.min(2, len / 2) : 0;
          const el = (
            <circle key={row.group} cx="90" cy="90" r={r} className="so-donut-seg"
              style={{ opacity: RAMP[Math.min(i, RAMP.length - 1)] }}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="so-donut-text">
        <span className="so-donut-amt mh-amount">{aud(total)}</span>
        <span className="so-donut-sub">Spent this month</span>
      </div>
    </div>
  );
}

/** Semicircle-ish gauge (240° arc), monochrome; red once over budget. */
function Gauge({ pct }: { pct: number }) {
  const r = 80;
  const arc = (240 / 360) * 2 * Math.PI * r;
  const full = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100 * arc;
  return (
    <svg className="so-gauge" viewBox="0 0 200 170" aria-hidden>
      <circle cx="100" cy="100" r={r} className="so-gauge-track" strokeDasharray={`${arc} ${full}`} transform="rotate(150 100 100)" />
      {filled > 0 && (
        <circle cx="100" cy="100" r={r} className="so-gauge-fill" data-over={pct > 100}
          strokeDasharray={`${filled} ${full}`} transform="rotate(150 100 100)" />
      )}
    </svg>
  );
}

/** Income this month: received so far + the next expected regular income. */
export function IncomeCard({ transactions, recurring, loading, error, today }: {
  transactions: SpendTxn[];
  recurring: Recurring[];
  loading: boolean;
  error?: boolean;
  today: Date;
}) {
  const ym = isoDay(today).slice(0, 7);
  const received = useMemo(
    () => Math.round(transactions.filter((t) => txnDay(t)?.startsWith(ym) && isIncome(t))
      .reduce((a, t) => a + Number(t.amount) * 100, 0)) / 100,
    [transactions, ym],
  );
  const next = useMemo(() => {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 45);
    const list = projectRecurring(recurring, isoDay(today), isoDay(end), ["income"]) as Array<{ date: string; merchant: string; amount: number }>;
    return list[0] || null;
  }, [recurring, today]);

  return (
    <HomeCard label="Income this month" labelId="so-income-label" className="so-income"
      actions={<AskSparkButton label="Ask Maal about your income" question="How does my income this month compare with my spending, and how much could I put aside?" />}>
      {loading ? <div className="mh-skel" style={{ height: 80 }} /> : error ? (
        <p className="mh-muted mh-small m-0">Your income couldn’t load right now.</p>
      ) : (
        <>
          <p className="so-kicker">Received so far</p>
          <p className="so-income-total mh-amount">{aud(received)}</p>
          <p className="so-kicker mt-4">Next upcoming income</p>
          {next ? (
            <div className="so-income-row">
              <span className="so-income-avatar" aria-hidden><CircleDollarSign /></span>
              <span className="min-w-0 flex-1">
                <span className="so-cat-name">{next.merchant}</span>
                <span className="so-cat-sub">{shortDate(next.date)}</span>
              </span>
              <span className="so-income-amt mh-amount">{signedCents(next.amount)}</span>
            </div>
          ) : (
            <p className="mh-muted mh-small m-0">No regular income spotted yet. Once your pay comes in a few times, Maal will show when the next one is due.</p>
          )}
        </>
      )}
    </HomeCard>
  );
}
