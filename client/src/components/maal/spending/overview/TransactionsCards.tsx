import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { EyeOff } from "lucide-react";
import {
  countsAsSpend, groupOf, isIncome, isoDay, projectRecurring, twoWeekWindow,
} from "../../../../../../shared/spending-overview.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud, shortDate, signedCents } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import { iconForGroup } from "./categoryIcons";
import { catVars } from "../categoryColour";
import { openTransactionDetail } from "../transaction-detail/TransactionDetailMount";
import type { Recurring, SpendTxn } from "./useSpendingData";

/** Latest transactions: category icon, merchant, date, amount. Money that doesn't count as spending is greyed. */
export function LatestTransactionsCard({ transactions, excluded, loading, error }: {
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  loading: boolean;
  error?: boolean;
}) {
  const privacy = usePrivacy();
  const recent = useMemo(
    () => [...transactions]
      .sort((a, b) => String(b.post_date || "").localeCompare(String(a.post_date || "")))
      .slice(0, 5),
    [transactions],
  );
  return (
    <HomeCard label="Latest transactions" to="/app/transactions" labelId="so-latest-label"
      actions={<AskSparkButton label="Ask Maal about your latest transactions" question="Can you walk me through my latest transactions? Anything unusual or worth a second look?" />}
      bodyClassName="so-list-body">
      {loading ? (
        <div className="space-y-3 p-5">{[0, 1, 2, 3].map((k) => <div key={k} className="mh-skel" style={{ height: 44 }} />)}</div>
      ) : error ? (
        <p className="mh-muted mh-small p-5 m-0">Transactions couldn’t load right now.</p>
      ) : recent.length === 0 ? (
        <div className="mh-empty p-5">
          <p className="m-0">No transactions yet. Connect a bank account and they’ll show up here.</p>
          <Link to="/app/accounts/connect" className="mh-btn-outline mt-4">Connect a bank</Link>
        </div>
      ) : (
        <ul className="list-none m-0 p-0">
          {recent.map((t, i) => {
            const amt = Number(t.amount) || 0;
            const group = groupOf(t);
            // Hidden in Transaction detail (HEL-100) → greyed like excluded money.
            const counted = !(t as SpendTxn & { hidden?: boolean }).hidden && (countsAsSpend(t, excluded) || isIncome(t));
            const Icon = iconForGroup(group);
            return (
              <li key={t.id ?? i} className="so-txn" data-muted={!counted}>
                <button type="button" className="td-txn-open" disabled={t.id == null}
                  onClick={() => t.id != null && openTransactionDetail(t.id)}>
                <span className="so-txn-icon cat-chip" style={catVars(group)} aria-hidden><Icon /></span>
                <span className="min-w-0 flex-1">
                  <span className="so-txn-name">{t.merchant || t.description || "Transaction"}</span>
                  <span className="so-txn-date">{shortDate(t.post_date)}</span>
                </span>
                {!counted && (
                  <EyeOff className="so-txn-hidden" aria-label="Not counted in your spending" role="img" />
                )}
                <span className="so-txn-amt mh-amount" data-in={amt > 0 && counted} aria-hidden={privacy || undefined}>
                  {amt > 0 ? signedCents(amt) : signedCents(Math.abs(amt)).replace("+", "")}
                </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Upcoming transactions: this week and next, with detected recurring bills on their due days. */
export function UpcomingCard({ recurring, loading, error, today }: {
  recurring: Recurring[];
  loading: boolean;
  error?: boolean;
  today: Date;
}) {
  const privacy = usePrivacy();
  const days = useMemo(() => twoWeekWindow(today), [today]);
  const todayIso = isoDay(today);
  const items = useMemo(
    () => projectRecurring(recurring, isoDay(days[0]), isoDay(days[13])) as Array<{ date: string; merchant: string; amount: number; kind: string }>,
    [recurring, days],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) m.set(it.date, [...(m.get(it.date) || []), it]);
    return m;
  }, [items]);
  const none = !loading && !error && items.length === 0;

  return (
    <HomeCard label="Upcoming transactions" labelId="so-upcoming-label" className="so-upcoming"
      actions={<AskSparkButton label="Ask Maal about upcoming bills" question="What bills and subscriptions do I have coming up in the next two weeks, and can I afford them comfortably?" />}>
      {loading ? <div className="mh-skel" style={{ height: 220 }} /> : (
        <div className="so-week-wrap">
          <div className="so-week" role="table" aria-label="This week and next">
            <div role="row" className="so-week-row so-week-head">
              {WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}
            </div>
            {[0, 1].map((w) => (
              <div role="row" className="so-week-row" key={w}>
                {days.slice(w * 7, w * 7 + 7).map((d) => {
                  const iso = isoDay(d);
                  const due = byDay.get(iso) || [];
                  const past = iso < todayIso;
                  return (
                    <div role="cell" key={iso} className="so-week-cell" data-past={past} data-today={iso === todayIso}>
                      <time className="so-week-num" dateTime={iso}>
                        <span aria-hidden>{d.getDate()}</span>
                        <span className="sr-only">{d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</span>
                      </time>
                      {due.slice(0, 2).map((x, i) => (
                        <span key={i} className="so-due" title={privacy ? x.merchant : `${x.merchant} · ${aud(x.amount)}`}>
                          <span className="so-due-name">{x.merchant}</span>
                          <span className="so-due-amt mh-amount" aria-hidden={privacy || undefined}>{aud(x.amount)}</span>
                        </span>
                      ))}
                      {due.length > 2 && <span className="so-due-more">+{due.length - 2} more</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {(none || error) && (
            <div className="mh-chart-empty so-week-empty">
              {error ? "Upcoming bills couldn’t load right now." : (
                <>
                  Add your recurring bills and subscriptions to see what’s coming up.{" "}
                  <Link to="/app/spending/recurring" search={{ add: 1 }} className="mh-link-btn" style={{ fontSize: 13 }}>Add recurring</Link>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </HomeCard>
  );
}
