import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { upcomingThisMonth } from "../../../../../../shared/spending-overview.mjs";
import { effectiveTransactions } from "../../../../../../shared/transaction-splits.mjs";
import { TransactionDetailMount } from "../transaction-detail/TransactionDetailMount";
import { SpendingSettingsLink } from "../settings/SpendingSettingsLink";
import { SpendThisMonthCard } from "./SpendThisMonthCard";
import { LatestTransactionsCard, UpcomingCard } from "./TransactionsCards";
import { BudgetPromoCard, CategoryBreakdownCard, IncomeCard } from "./SideCards";
import { ReportsCard } from "./ReportsCard";
import { useSpendingData } from "./useSpendingData";
import "@/components/maal/home/home.css";
import "./overview.css";

/**
 * Spending overview (/app/spending, redesign session 2 "Spending", HEL-83).
 * Left: spend this month, latest + upcoming transactions, reports.
 * Right: budget promo, category breakdown (expenses / budget), income.
 * All figures come from existing endpoints; maths lives in
 * shared/spending-overview.mjs (tested in test/spending-overview.test.js).
 */
export function SpendingOverview() {
  const data = useSpendingData();
  // Coming back from the settings drawer (/app/spending/settings) may have
  // changed the budget or excluded categories: reload so the cards match.
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);
  const { reload } = data;
  useEffect(() => {
    if (prevPath.current !== pathname && prevPath.current.startsWith("/app/spending/")) void reload();
    prevPath.current = pathname;
  }, [pathname, reload]);
  // One "today" per render pass keeps every card on the same day boundary.
  const today = useMemo(() => new Date(), []);
  // Excluded groups from Spending settings; undefined → server defaults.
  const excluded = data.settings?.excluded_groups;
  const includeUpcoming = data.settings?.include_upcoming ?? true;
  const budgetTotal = useMemo(() => {
    const overall = data.budgets.find((b) => !b.category_group);
    if (overall) return Number(overall.monthly_amount) || 0;
    return data.budgets.reduce((a, b) => a + (Number(b.monthly_amount) || 0), 0);
  }, [data.budgets]);
  const upcoming = useMemo(() => upcomingThisMonth(data.recurring, today), [data.recurring, today]);
  const monthName = today.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  // Totals ignore hidden transactions and count split parts by their own
  // category (Transaction detail, HEL-100/101). The latest list keeps raw rows.
  const counted = useMemo(() => effectiveTransactions(data.transactions), [data.transactions]);

  return (
    <div className="mh so">
      <div className="mh-page so-page">
        <div className="so-head">
          {/* The section tabs already show "Spending" as the visible title. */}
          <h1 className="sr-only">Spending overview</h1>
          <p className="so-month">{monthName}</p>
          <SpendingSettingsLink />
        </div>
        <div className="mh-grid so-grid">
          <div className="mh-col">
            <SpendThisMonthCard transactions={counted} excluded={excluded} budget={budgetTotal}
              loading={data.loading} error={data.errors.transactions} today={today} />
            <div className="so-pair">
              <LatestTransactionsCard transactions={data.transactions} excluded={excluded}
                loading={data.loading} error={data.errors.transactions} />
              <div id="upcoming" className="so-anchor-wrap">
                <UpcomingCard recurring={data.recurring} loading={data.loading} error={data.errors.recurring} today={today} />
              </div>
            </div>
            <ReportsCard transactions={counted} excluded={excluded}
              loading={data.loading} error={data.errors.transactions} today={today} />
          </div>
          <aside className="mh-col" aria-label="Budget and income">
            {!data.loading && !data.errors.budgets && budgetTotal <= 0 && <BudgetPromoCard />}
            <CategoryBreakdownCard transactions={counted} excluded={excluded} budgets={data.budgets}
              upcoming={upcoming} includeUpcoming={includeUpcoming} loading={data.loading}
              error={data.errors.transactions} budgetError={data.errors.budgets} today={today} />
            <IncomeCard transactions={counted} recurring={data.recurring}
              loading={data.loading} error={data.errors.transactions} today={today} />
          </aside>
        </div>
      </div>
      <TransactionDetailMount onChanged={reload} />
    </div>
  );
}
