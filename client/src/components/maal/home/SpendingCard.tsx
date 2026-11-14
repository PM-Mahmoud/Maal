import { useMemo } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftRight, Car, CircleDollarSign, Coffee, Fuel, HeartPulse, Home, ShoppingBag, ShoppingCart, Store, Zap,
} from "lucide-react";
import { monthSpending } from "../../../../../shared/home-accounts.mjs";
import { AskSparkButton, HomeCard } from "./HomeCard";
import { CONNECT_PATH } from "./NetWorthCard";
import type { Txn } from "./useHomeData";
import { aud, audCompact, signedCents, shortDate } from "./format";

function iconFor(t: Txn) {
  const c = `${t.category || ""} ${(t as any).category_group || ""} ${t.description || ""}`.toLowerCase();
  if (Number(t.amount) > 0) return CircleDollarSign;
  if (c.includes("transfer")) return ArrowLeftRight;
  if (c.includes("grocer") || c.includes("woolworths") || c.includes("coles") || c.includes("aldi")) return ShoppingCart;
  if (c.includes("fuel") || c.includes("petrol")) return Fuel;
  if (c.includes("transport") || c.includes("uber") || c.includes("car")) return Car;
  if (c.includes("eat") || c.includes("dining") || c.includes("cafe") || c.includes("coffee") || c.includes("restaurant")) return Coffee;
  if (c.includes("health") || c.includes("medical") || c.includes("pharmac")) return HeartPulse;
  if (c.includes("util") || c.includes("bill") || c.includes("energy")) return Zap;
  if (c.includes("rent") || c.includes("mortgage") || c.includes("housing")) return Home;
  if (c.includes("shop")) return ShoppingBag;
  return Store;
}

/** "Spent in <month>": daily spending calendar + recent transactions. */
export function SpendingCard({ transactions, loading, error }: { transactions: Txn[]; loading: boolean; error?: boolean }) {
  const router = useRouter();
  const now = new Date();
  const monthName = now.toLocaleDateString("en-AU", { month: "long" });
  const { total, byDay } = useMemo(
    () => monthSpending(transactions as Array<Record<string, unknown>>, now.getFullYear(), now.getMonth(), now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions],
  );
  const recent = useMemo(
    () => [...transactions]
      .sort((a, b) => new Date(b.post_date || 0).getTime() - new Date(a.post_date || 0).getTime())
      .slice(0, 5),
    [transactions],
  );
  const empty = !loading && !error && transactions.length === 0;
  const today = now.getDate();

  return (
    <HomeCard label={`Spent in ${monthName}`} to="/app/transactions" labelId="mh-spend-label"
      actions={<AskSparkButton label="Ask Maal about your spending" question={`Where did my money go in ${monthName}? Anything unusual?`} />}>
      {empty ? (
        <div className="mh-empty">
          <p className="mh-serif-title" style={{ fontSize: 22 }}>See where your money goes</p>
          <p className="mt-2">Connect your everyday bank account and Maal will build this calendar from your real transactions.</p>
          <button type="button" className="mh-btn-ink mt-4" onClick={() => router.history.push(CONNECT_PATH)}>Connect a bank</button>
        </div>
      ) : (
        <div className="mh-spend">
          <div>
            {loading ? <div className="mh-skel" style={{ width: 110, height: 38 }} /> : (
              <p className="mh-big">{error ? "—" : aud(total)}</p>
            )}
            <div className="mh-cal" role="list" aria-label={`Daily spending in ${monthName}`}>
              {byDay.map((v, i) => {
                const day = i + 1;
                const isToday = day === today;
                const future = v === null;
                return (
                  <div key={day} role="listitem" className="mh-day" data-today={isToday} data-future={future} data-past={!future && !isToday}
                    aria-label={`${day} ${monthName}: ${future ? "upcoming" : aud(v ?? 0)}`}>
                    <span>{day}</span>
                    <b>{future ? "–" : (v ?? 0) >= 1000 ? audCompact(v ?? 0) : aud(v ?? 0)}</b>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mh-section-label">Recent transactions</p>
            {loading ? (
              <div className="space-y-3">{[0, 1, 2, 3].map((k) => <div key={k} className="mh-skel" style={{ height: 44 }} />)}</div>
            ) : error ? (
              <p className="mh-muted mh-small">Transactions couldn’t load right now.</p>
            ) : (
              <ul className="list-none m-0 p-0">
                {recent.map((t, i) => {
                  const amt = Number(t.amount) || 0;
                  const Icon = iconFor(t);
                  return (
                    <li key={t.id ?? i} className="mh-txn">
                      <span className="mh-txn-icon"><Icon aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="mh-txn-name block">{t.merchant || t.description || "Transaction"}</span>
                        <span className="mh-txn-date block">{shortDate(t.post_date)}</span>
                      </span>
                      <span className="mh-txn-amt" data-in={amt > 0}>
                        {amt > 0 ? signedCents(amt) : signedCents(Math.abs(amt)).replace("+", "")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {!loading && !error && (
              <Link to="/app/transactions" className="mh-link-btn mh-small inline-block mt-2" style={{ fontSize: 13 }}>
                See all transactions
              </Link>
            )}
          </div>
        </div>
      )}
    </HomeCard>
  );
}
