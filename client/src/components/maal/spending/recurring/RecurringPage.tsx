import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, Link2, List, MoreVertical, Pencil, Plus, Trash2, X, XCircle,
} from "lucide-react";
import {
  FREQUENCY_LABELS, creditCardPayments, fortnightWindow, isoDay, monthlyEquivalent, monthlyTotals,
  nextOccurrence, offsetForDay, parseDay, projectItems, rollForward, summarise, type Occurrence, type RecurringKind,
} from "../../../../../../shared/recurring.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud, audCents } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import { SpendingSettingsLink } from "../settings/SpendingSettingsLink";
import { AddRecurringDialog, type DialogMode } from "./AddRecurringDialog";
import {
  createRecurringItem, decideDetected, deleteRecurringItem, manualRowId, undoDecision, type RecurringItem,
} from "./api";
import { KindBadge } from "./KindIcon";
import { useRecurringData, type RecurringTxn } from "./useRecurringData";
import "@/components/maal/home/home.css";
import "../overview/overview.css";
import "../settings/spending-settings.css";
import "./recurring.css";

type Toast = { msg: string; undo?: () => Promise<void> };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayMonth = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => {
  const d = parseDay(iso);
  return d ? d.toLocaleDateString("en-AU", opts) : "";
};
const money = (kind: RecurringKind, n: number) => (kind === "income" ? `+${audCents(n)}` : audCents(n));
/** Calendar cells are narrow: whole dollars from $100 up, cents below. */
const cellMoney = (kind: RecurringKind, n: number) => {
  const s = n >= 100 ? aud(n) : audCents(n);
  return kind === "income" ? `+${s}` : s;
};

/**
 * Spending › Recurring (/app/spending/recurring, redesign session 2,
 * HEL-104 + HEL-105). Upcoming bills, subscriptions and income on a
 * fortnight calendar or as a list; add / edit / remove manual items, and
 * confirm or dismiss ones Maal detected. Right: credit card repayments.
 * Maths: shared/recurring.mjs (tested in test/recurring-items.test.js).
 */
export function RecurringPage({ openAdd, onAddClosed }: { openAdd?: boolean; onAddClosed?: () => void }) {
  const data = useRecurringData();
  const today = useMemo(() => new Date(), []);
  const [dialog, setDialog] = useState<DialogMode | null>(openAdd ? { mode: "add" } : null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => { if (openAdd) setDialog((d) => d ?? { mode: "add" }); }, [openAdd]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  function closeDialog() {
    setDialog(null);
    onAddClosed?.();
  }

  async function act(fn: () => Promise<void>, msg: string, undo?: () => Promise<void>) {
    try {
      await fn();
      setToast({ msg, undo });
      await data.reload();
    } catch (e) {
      setToast({ msg: (e as Error).message });
    }
  }

  const handlers: RowHandlers = {
    edit: (item) => setDialog({ mode: "edit", item }),
    remove: (item) => {
      const rowId = manualRowId(item);
      if (!rowId) return;
      void act(() => deleteRecurringItem(rowId), `${item.merchant} removed.`, async () => {
        await createRecurringItem({
          name: item.merchant, amount: item.averageAmount, frequency: item.cadence, kind: item.kind,
          next_date: item.nextEstimate, category_group: item.category_group ?? null, source_key: item.merchant_key ?? null,
        });
      });
    },
    confirm: (item) => {
      if (!item.merchant_key) return;
      const key = item.merchant_key;
      void act(() => decideDetected(key, "confirmed"), `${item.merchant} marked as recurring.`, () => undoDecision(key));
    },
    dismiss: (item) => {
      if (!item.merchant_key) return;
      const key = item.merchant_key;
      void act(() => decideDetected(key, "dismissed"), `${item.merchant} hidden from recurring.`, () => undoDecision(key));
    },
  };

  return (
    <div className="mh so rc">
      <div className="mh-page so-page">
        <div className="so-head">
          <h1 className="sr-only">Recurring bills, subscriptions and income</h1>
          <p className="so-month">Bills, subscriptions and income that repeat</p>
          <SpendingSettingsLink />
        </div>
        <div className="mh-grid so-grid rc-grid">
          <div className="mh-col">
            <UpcomingCard items={data.items} loading={data.loading} error={data.errors.recurring} manualError={data.errors.manual}
              today={today} offset={offset} setOffset={setOffset} onAdd={() => setDialog({ mode: "add" })} handlers={handlers} />
          </div>
          <aside className="mh-col" aria-label="Credit card repayments">
            <CardBillsCard transactions={data.transactions} loading={data.loading} error={data.errors.transactions} today={today} />
          </aside>
        </div>
      </div>

      {dialog && (
        <AddRecurringDialog state={dialog} items={data.items} transactions={data.transactions} transactionsError={data.errors.transactions}
          today={today} onClose={closeDialog}
          onSaved={(msg, item) => {
            closeDialog();
            // Show the window holding the saved item's next date (the design's "View" jump).
            const next = rollForward(item.nextEstimate, item.cadence, today);
            if (next) setOffset(Math.max(0, offsetForDay(next, today)));
            setToast({ msg });
            void data.reload();
          }} />
      )}

      {toast && (
        <div className="mh-shell rc-toast" role="status" aria-live="polite">
          <CircleCheck className="rc-toast-icon" aria-hidden />
          <span className="rc-toast-msg">{toast.msg}</span>
          {toast.undo && (
            <button type="button" className="mh-link-btn rc-toast-undo" onClick={() => {
              const undo = toast.undo!;
              setToast(null);
              void act(undo, "Change undone.");
            }}>Undo</button>
          )}
          <button type="button" className="ss-iconbtn" onClick={() => setToast(null)} aria-label="Dismiss message"><X aria-hidden /></button>
        </div>
      )}
    </div>
  );
}

type RowHandlers = {
  edit: (item: RecurringItem) => void;
  remove: (item: RecurringItem) => void;
  confirm: (item: RecurringItem) => void;
  dismiss: (item: RecurringItem) => void;
};

function UpcomingCard({ items, loading, error, manualError, today, offset, setOffset, onAdd, handlers }: {
  items: RecurringItem[];
  loading: boolean;
  error?: boolean;
  manualError?: boolean;
  today: Date;
  offset: number;
  setOffset: (n: number) => void;
  onAdd: () => void;
  handlers: RowHandlers;
}) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const days = useMemo(() => fortnightWindow(today, offset), [today, offset]);
  const from = isoDay(days[0]);
  const to = isoDay(days[13]);
  const occ = useMemo(() => projectItems(items, from, to), [items, from, to]);
  const summary = useMemo(() => summarise(occ), [occ]);
  const next = useMemo(() => nextOccurrence(items, today), [items, today]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const range = `${dayMonth(from)} – ${dayMonth(to)}`;

  return (
    <HomeCard label="Upcoming transactions" labelId="rc-upcoming-label" className="rc-upcoming"
      actions={<>
        <button type="button" className="mh-spark-btn rc-add-btn" onClick={onAdd} aria-label="Add recurring transaction" title="Add recurring transaction">
          <Plus aria-hidden />
        </button>
        <AskSparkButton label="Ask Maal about your recurring payments"
          question="Look at my recurring bills, subscriptions and income. Is there anything I could cancel, switch or plan around in the next month?" />
      </>}>
      <div className="rc-toolbar">
        {view === "calendar" ? (
          <div className="rc-range">
            <button type="button" className="ss-iconbtn" onClick={() => setOffset(offset - 1)} aria-label="Previous fortnight"><ChevronLeft aria-hidden /></button>
            <button type="button" className="ss-iconbtn" onClick={() => setOffset(offset + 1)} aria-label="Next fortnight"><ChevronRight aria-hidden /></button>
            <p className="rc-range-label" aria-live="polite">
              <span>Upcoming</span><span className="rc-range-dates"> · {range}</span>
            </p>
            {offset !== 0 && <button type="button" className="mh-link-btn rc-today" onClick={() => setOffset(0)}>This fortnight</button>}
          </div>
        ) : (
          <p className="rc-range-label m-0"><span>All recurring</span></p>
        )}
        <div className="so-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")} aria-label="Calendar view" title="Calendar view"><CalendarDays aria-hidden /></button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view" title="List view"><List aria-hidden /></button>
        </div>
      </div>

      {manualError && <p className="rc-warn" role="alert">Your own recurring items couldn’t load right now, so only ones Maal detected are shown.</p>}

      {loading ? (
        <div className="mh-skel" style={{ height: 260 }} />
      ) : view === "calendar" ? (
        <>
          <div className="so-week-wrap">
            <Fortnight days={days} occ={occ} today={today} />
            {(error || occ.length === 0) && (
              <div className="mh-chart-empty rc-empty">
                {error ? "Recurring payments couldn’t load right now. Try again shortly." : next ? (
                  <>
                    Your next recurring transaction is on {dayMonth(next.date, { weekday: "long", day: "numeric", month: "long" })}.
                    <button type="button" className="mh-link-btn rc-empty-link" onClick={() => setOffset(offsetForDay(next.date, today))}>View</button>
                  </>
                ) : (
                  <>
                    Add your recurring bills and subscriptions to see what’s coming up.
                    <button type="button" className="mh-link-btn rc-empty-link" onClick={onAdd}>Add recurring</button>
                  </>
                )}
              </div>
            )}
          </div>
          {!error && occ.length > 0 && (
            <>
              <dl className="rc-summary">
                <div><dt>{summary.bills.count === 1 ? "1 bill" : `${summary.bills.count} bills`}</dt><dd className="mh-amount">{audCents(summary.bills.total)}</dd></div>
                <div><dt>{summary.subscriptions.count === 1 ? "1 subscription" : `${summary.subscriptions.count} subscriptions`}</dt><dd className="mh-amount">{audCents(summary.subscriptions.total)}</dd></div>
                <div><dt>Total going out</dt><dd className="mh-amount">{audCents(summary.outgoing)}</dd></div>
                {summary.income.count > 0 && <div><dt>Income expected</dt><dd className="mh-amount rc-in">+{audCents(summary.income.total)}</dd></div>}
              </dl>
              <OccurrenceList occ={occ} byId={byId} handlers={handlers} />
            </>
          )}
        </>
      ) : error ? (
        <p className="mh-muted mh-small m-0">Recurring payments couldn’t load right now. Try again shortly.</p>
      ) : items.length === 0 ? (
        <div className="mh-empty rc-list-empty">
          <p className="m-0">No recurring bills, subscriptions or income yet.</p>
          <button type="button" className="mh-btn-outline mt-4" onClick={onAdd}><Plus aria-hidden /> Add recurring</button>
        </div>
      ) : (
        <AllList items={items} today={today} handlers={handlers} />
      )}
    </HomeCard>
  );
}

/** Two-week Sunday-first calendar with a badge + amount on each due day. */
function Fortnight({ days, occ, today }: { days: Date[]; occ: Occurrence[]; today: Date }) {
  const privacy = usePrivacy();
  const todayIso = isoDay(today);
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occ) m.set(o.date, [...(m.get(o.date) || []), o]);
    return m;
  }, [occ]);
  return (
    <div className="so-week rc-week" role="table" aria-label="Recurring transactions this fortnight">
      <div role="row" className="so-week-row so-week-head">
        {WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}
      </div>
      {[0, 1].map((w) => (
        <div role="row" className="so-week-row" key={w}>
          {days.slice(w * 7, w * 7 + 7).map((d) => {
            const iso = isoDay(d);
            const due = byDay.get(iso) || [];
            return (
              <div role="cell" key={iso} className="so-week-cell rc-cell" data-past={iso < todayIso} data-today={iso === todayIso}>
                <time className="so-week-num" dateTime={iso}>
                  <span aria-hidden>{d.getDate()}</span>
                  <span className="sr-only">{d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</span>
                </time>
                {due.slice(0, 2).map((x, i) => (
                  <span key={i} className="rc-due" title={privacy ? x.merchant : `${x.merchant} · ${money(x.kind, x.amount)}`}>
                    <KindBadge kind={x.kind} size="sm" />
                    <span className="sr-only">{x.merchant}</span>
                    <span className="rc-due-amt mh-amount" data-in={x.kind === "income"} aria-hidden={privacy || undefined}>{cellMoney(x.kind, x.amount)}</span>
                  </span>
                ))}
                {due.length > 2 && <span className="so-due-more">+{due.length - 2} more</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const PAGE = 5;

/** This fortnight's payments as rows (first five, then See more). */
function OccurrenceList({ occ, byId, handlers }: { occ: Occurrence[]; byId: Map<string, RecurringItem>; handlers: RowHandlers }) {
  const [all, setAll] = useState(false);
  const shown = all ? occ : occ.slice(0, PAGE);
  return (
    <div className="rc-list">
      <h3 className="rc-list-title">Upcoming</h3>
      <ul className="rc-rows">
        {shown.map((o, i) => {
          const item = o.id ? byId.get(o.id) : undefined;
          return (
            <Row key={`${o.id}-${o.date}-${i}`} item={item} kind={o.kind} name={o.merchant} amount={o.amount}
              sub={`${FREQUENCY_LABELS[o.cadence]} · ${o.kind === "income" ? "Expected" : "Due"} ${dayMonth(o.date)}`} handlers={handlers} />
          );
        })}
      </ul>
      {occ.length > PAGE && (
        <button type="button" className="mh-btn-outline mh-btn-wide rc-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show less" : "See more"}
        </button>
      )}
    </div>
  );
}

const SECTIONS: Array<{ kind: RecurringKind; label: string }> = [
  { kind: "bill", label: "Bills" },
  { kind: "subscription", label: "Subscriptions" },
  { kind: "income", label: "Income" },
];

/** Every recurring schedule, grouped by kind, with average-month totals. */
function AllList({ items, today, handlers }: { items: RecurringItem[]; today: Date; handlers: RowHandlers }) {
  const totals = useMemo(() => monthlyTotals(items), [items]);
  return (
    <div className="rc-list rc-all">
      {SECTIONS.map(({ kind, label }) => {
        const rows = items.filter((i) => i.kind === kind);
        if (!rows.length) return null;
        return (
          <section key={kind} aria-label={label}>
            <h3 className="rc-list-title">{label}</h3>
            <ul className="rc-rows">
              {rows.map((item) => {
                const next = rollForward(item.nextEstimate, item.cadence, today) || item.nextEstimate;
                const perMonth = item.cadence === "monthly" ? "" : ` · about ${audCents(monthlyEquivalent(item.averageAmount, item.cadence))} a month`;
                return (
                  <Row key={item.id} item={item} kind={item.kind} name={item.merchant} amount={item.averageAmount}
                    sub={`${FREQUENCY_LABELS[item.cadence]} · next ${dayMonth(next)}${perMonth}`} handlers={handlers} />
                );
              })}
            </ul>
          </section>
        );
      })}
      <dl className="rc-summary rc-month">
        <div><dt>Going out, average month</dt><dd className="mh-amount">{audCents(totals.outgoing)}</dd></div>
        <div><dt>Coming in, average month</dt><dd className="mh-amount rc-in">+{audCents(totals.income)}</dd></div>
      </dl>
    </div>
  );
}

function Row({ item, kind, name, amount, sub, handlers }: {
  item?: RecurringItem;
  kind: RecurringKind;
  name: string;
  amount: number;
  sub: string;
  handlers: RowHandlers;
}) {
  const detected = item?.source === "detected";
  return (
    <li className="rc-row">
      <KindBadge kind={kind} />
      <span className="min-w-0 flex-1">
        <span className="rc-row-name">
          <span className="rc-row-text">{name}</span>
        </span>
        <span className="rc-row-sub">
          {sub}
          {detected && !item?.confirmed && <span className="rc-chip" title="Maal spotted this in your transactions">Detected</span>}
        </span>
      </span>
      <span className="rc-row-amt mh-amount" data-in={kind === "income"}>{money(kind, amount)}</span>
      {item && <RowMenu item={item} handlers={handlers} />}
    </li>
  );
}

function RowMenu({ item, handlers }: { item: RecurringItem; handlers: RowHandlers }) {
  const detected = item.source === "detected";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="mh-dots" aria-label={`Options for ${item.merchant}`}>
        <MoreVertical aria-hidden size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="mh-shell mh-menu rc-menu" align="end" sideOffset={6}>
          {detected && !item.confirmed && item.merchant_key && (
            <DropdownMenu.Item className="mh-menu-item" onSelect={() => handlers.confirm(item)}><Check aria-hidden /> Yes, it’s recurring</DropdownMenu.Item>
          )}
          <DropdownMenu.Item className="mh-menu-item" onSelect={() => handlers.edit(item)}><Pencil aria-hidden /> Edit</DropdownMenu.Item>
          {detected ? (
            item.merchant_key && (
              <DropdownMenu.Item className="mh-menu-item" onSelect={() => handlers.dismiss(item)}><XCircle aria-hidden /> Not recurring</DropdownMenu.Item>
            )
          ) : (
            <DropdownMenu.Item className="mh-menu-item rc-menu-danger" onSelect={() => handlers.remove(item)}><Trash2 aria-hidden /> Remove</DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Credit card repayments found in your transactions (what was paid, never a guessed balance). */
function CardBillsCard({ transactions, loading, error, today }: {
  transactions: RecurringTxn[];
  loading: boolean;
  error?: boolean;
  today: Date;
}) {
  const cards = useMemo(() => creditCardPayments(transactions, today), [transactions, today]);
  return (
    <HomeCard label="Credit card bills" labelId="rc-cards-label" className="rc-cards"
      actions={<AskSparkButton label="Ask Maal about your credit card repayments"
        question="Looking at my credit card repayments, am I paying them off in full each month, and is there anything I should change?" />}
      bodyClassName={cards.length && !loading && !error ? "so-list-body" : "mh-card-body"}>
      {loading ? (
        <div className="mh-skel" style={{ height: 120 }} />
      ) : error ? (
        <p className="mh-muted mh-small m-0">Credit card repayments couldn’t load right now.</p>
      ) : cards.length === 0 ? (
        <div className="rc-cards-empty">
          <Link2 aria-hidden />
          <p className="m-0">No credit card repayments found in your accounts</p>
          <Link to="/app/accounts/connect" className="mh-btn-outline mh-btn-wide">Connect more accounts</Link>
        </div>
      ) : (
        <ul className="list-none m-0 p-0">
          {cards.map((c) => (
            <li key={c.key} className="so-txn">
              <InstitutionLogo name={c.institution || c.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="so-txn-name">{c.name}</span>
                <span className="so-txn-date">Last paid {dayMonth(c.lastDate)}{c.count > 1 ? ` · ${c.count} repayments` : ""}</span>
              </span>
              <span className="so-txn-amt mh-amount">{audCents(c.lastAmount)}</span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
