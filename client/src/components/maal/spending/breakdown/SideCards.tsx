import { useMemo } from "react";
import { frequentExpenses, largestExpenses, monthCashFlow } from "../../../../../../shared/spending-breakdown.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { audCents, shortDate, signedCents } from "@/components/maal/home/format";
import type { SpendTxn } from "../overview/useSpendingData";
import { openTransactionDetail } from "../transaction-detail/TransactionDetailMount";
import type { CustomCategory } from "./api";
import { CatIcon, monthLabel } from "./parts";

type Common = { transactions: SpendTxn[]; excluded: string[] | undefined; year: number; month: number; loading: boolean; error?: boolean };

/** Cash flow for the chosen month: income vs expenses bars + net. */
export function CashFlowCard({ transactions, excluded, year, month, loading, error }: Common) {
  const cf = useMemo(() => monthCashFlow(transactions, year, month, excluded), [transactions, year, month, excluded]);
  const max = Math.max(cf.income, cf.expenses, 1);
  return (
    <HomeCard label="Cash flow" labelId="bd-cf-label" className="bd-cf"
      actions={<AskSparkButton label="Ask Maal about this month’s cash flow" question={`How did my income compare with my spending in ${monthLabel(year, month)}, and what could I do differently next month?`} />}>
      {loading ? <div className="mh-skel" style={{ height: 120 }} /> : error ? (
        <p className="mh-muted mh-small m-0">Your cash flow couldn’t load right now.</p>
      ) : (
        <dl className="bd-cf-list">
          <div><dt>Income</dt><dd className="mh-amount">{audCents(cf.income)}</dd>
            <span className="mh-bar bd-cf-bar"><i data-alt="true" style={{ width: `${(cf.income / max) * 100}%` }} /></span></div>
          <div><dt>Expenses</dt><dd className="mh-amount">{signedCents(-cf.expenses)}</dd>
            <span className="mh-bar bd-cf-bar"><i style={{ width: `${(cf.expenses / max) * 100}%` }} /></span></div>
          <div className="bd-cf-net"><dt>Net cash flow</dt><dd className="mh-amount" data-neg={cf.net < 0}>{signedCents(cf.net)}</dd></div>
        </dl>
      )}
    </HomeCard>
  );
}

/** The month's three biggest spends; each opens the transaction detail. */
export function LargestCard({ transactions, excluded, year, month, loading, error, custom }: Common & { custom: CustomCategory[] }) {
  const list = useMemo(() => largestExpenses(transactions, year, month, excluded, 3), [transactions, year, month, excluded]);
  return (
    <HomeCard label="Largest transactions" labelId="bd-big-label" className="bd-big" bodyClassName="bd-list-body">
      {loading ? <div className="mh-skel m-5" style={{ height: 90 }} /> : error ? (
        <p className="mh-muted mh-small m-5">Transactions couldn’t load right now.</p>
      ) : list.length === 0 ? (
        <p className="mh-empty m-0">No spending in {monthLabel(year, month)}.</p>
      ) : list.map((t) => (
        <button key={String(t.id)} type="button" className="bd-txn" onClick={() => t.id != null && openTransactionDetail(t.id)}>
          <CatIcon name={String(t.category_group || "Other")} custom={custom} size={30} />
          <span className="min-w-0 flex-1">
            <span className="bd-trunc">{t.merchant || t.description || "Transaction"}</span>
            <span className="bd-sub">{shortDate(t.post_date)}</span>
          </span>
          <span className="mh-amount bd-amt">{audCents(t.spend)}</span>
        </button>
      ))}
    </HomeCard>
  );
}

/** Merchants paid more than once this month. */
export function FrequentCard({ transactions, excluded, year, month, loading, error, custom }: Common & { custom: CustomCategory[] }) {
  const list = useMemo(() => frequentExpenses(transactions, year, month, excluded, 3), [transactions, year, month, excluded]);
  return (
    <HomeCard label="Most frequent expenses" labelId="bd-freq-label" className="bd-freq">
      {loading ? <div className="mh-skel" style={{ height: 90 }} /> : error ? (
        <p className="mh-muted mh-small m-0">Transactions couldn’t load right now.</p>
      ) : list.length === 0 ? (
        <p className="mh-empty m-0">No repeat spending in {monthLabel(year, month)} yet.</p>
      ) : (
        <ul className="bd-freq-grid">
          {list.map((f) => (
            <li key={f.merchant}>
              <CatIcon name={f.group} custom={custom} size={28} />
              <span className="bd-freq-count">{f.count}×</span>
              <span className="bd-trunc bd-sub">{f.merchant}</span>
              <span className="bd-sub mh-amount">{audCents(f.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
