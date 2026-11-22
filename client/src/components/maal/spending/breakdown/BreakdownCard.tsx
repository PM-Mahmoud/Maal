import { useMemo, useState } from "react";
import { ChevronDown, Pencil, Settings2, Sparkles } from "lucide-react";
import { budgetRows } from "../../../../../../shared/spending-overview.mjs";
import {
  breakdownTable, groupRollup, incomeTable, withAvailable,
} from "../../../../../../shared/spending-breakdown.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import type { Budget } from "../settings/api";
import type { SpendTxn } from "../overview/useSpendingData";
import type { CategoryGroupDef, CustomCategory } from "./api";
import { CatIcon, ChangeBadge, Donut, Gauge, expenseCategories, incomeCategoryNames, monthLabel, rampAt } from "./parts";

export type Tab = "expenses" | "budget" | "income";

/**
 * Category breakdown (HEL-84): Expenses (donut + table with change vs last
 * month, by category or group), Budget (gauge + spent / budget / available),
 * Income (donut + income by source). Clicking a category opens its detail.
 */
export function BreakdownCard({
  tab, onTab, transactions, excluded, budgets, custom, groups, year, month, current, loading, error, budgetError,
  onOpenCategory, onEditBudget, onAi, onManage,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  budgets: Budget[];
  custom: CustomCategory[];
  groups: CategoryGroupDef[];
  year: number;
  month: number;
  current: boolean;
  loading: boolean;
  error?: boolean;
  budgetError?: boolean;
  onOpenCategory: (name: string) => void;
  onEditBudget: () => void;
  onAi: () => void;
  onManage: () => void;
}) {
  const privacy = usePrivacy();
  const [viewBy, setViewBy] = useState<"category" | "group">("category");
  const [budgetView, setBudgetView] = useState<"all" | "over" | "under">("all");
  const [all, setAll] = useState(false);

  const expenseNames = useMemo(() => expenseCategories(custom, excluded), [custom, excluded]);
  const rows = useMemo(
    () => breakdownTable(transactions, year, month, excluded, all ? expenseNames : []),
    [transactions, year, month, excluded, all, expenseNames],
  );
  const spendRows = rows.filter((r) => r.amount > 0);
  const spent = spendRows.reduce((a, r) => a + r.amount, 0);
  const grouped = useMemo(
    () => groupRollup(spendRows, groups.filter((g) => g.kind === "expense").map((g) => ({ name: g.name, categories: g.categories }))),
    [spendRows, groups],
  );
  const income = useMemo(() => incomeTable(transactions, year, month, incomeCategoryNames(custom)), [transactions, year, month, custom]);
  const incomeTotal = income.reduce((a, r) => a + r.amount, 0);

  const overall = budgets.find((b) => !b.category_group);
  const budgetTotal = overall ? Number(overall.monthly_amount) : budgets.reduce((a, b) => a + Number(b.monthly_amount || 0), 0);
  const bRows = useMemo(() => withAvailable(budgetRows(spendRows, budgets)), [spendRows, budgets]);
  const bShown = bRows.filter((r) => budgetView === "all" || (budgetView === "over" ? r.spent > r.budget : r.spent <= r.budget));
  const pct = budgetTotal > 0 ? (spent / budgetTotal) * 100 : 0;
  const when = current ? "this month" : `in ${monthLabel(year, month)}`;

  const tabs = (
    <div className="bd-tabs" role="tablist" aria-label="Breakdown view">
      {(["expenses", "budget", "income"] as const).map((t) => (
        <button key={t} type="button" role="tab" id={`bd-tab-${t}`} aria-selected={tab === t} aria-controls="bd-tab-panel" onClick={() => onTab(t)}>
          {t === "expenses" ? "Expenses" : t === "budget" ? "Budget" : "Income"}
        </button>
      ))}
    </div>
  );

  return (
    <HomeCard label="Category breakdown" labelId="bd-cat-label" className="bd-cat" bodyClassName="bd-cat-body"
      actions={<>
        <AskSparkButton label="Ask Maal about this breakdown" question={`Looking at my spending by category ${when}, which categories stand out and where could I realistically spend less?`} />
        <button type="button" className="mh-spark-btn bd-ink-btn" onClick={onManage} aria-label="Manage categories" title="Manage categories"><Settings2 aria-hidden /></button>
      </>}>
      {tabs}
      <div id="bd-tab-panel" role="tabpanel" aria-labelledby={`bd-tab-${tab}`} className="bd-cat-panel">
        {loading ? <div className="mh-skel" style={{ height: 300 }} /> : error ? (
          <p className="mh-muted mh-small m-0">Your spending couldn’t load right now.</p>
        ) : tab === "expenses" ? (
          spendRows.length === 0 ? (
            <div className="mh-empty"><p className="m-0">No spending {when}. Categories appear here as transactions come in.</p></div>
          ) : (
            <>
              <Donut rows={viewBy === "group" ? grouped : spendRows} total={spent} label={current ? "Spent this month" : "Spent"} privacy={privacy} />
              <div className="bd-viewby">
                <label className="mh-muted mh-small" htmlFor="bd-viewby">View by</label>
                <span className="so-select">
                  <select id="bd-viewby" value={viewBy} onChange={(e) => setViewBy(e.target.value as "category" | "group")}>
                    <option value="category">Category</option>
                    <option value="group">Group</option>
                  </select>
                  <ChevronDown aria-hidden />
                </span>
              </div>
              {viewBy === "category" ? (
                <div className="bd-table" role="table" aria-label="Spending by category">
                  <div className="bd-tr bd-th" role="row">
                    <span role="columnheader">Category</span>
                    <span role="columnheader">Spent</span>
                    <span role="columnheader" className="bd-col-pct">% of expenses</span>
                    <span role="columnheader">vs last month</span>
                  </div>
                  {(all ? rows : spendRows.slice(0, 6)).map((r) => (
                    <button key={r.group} type="button" className="bd-tr" role="row" onClick={() => onOpenCategory(r.group)}>
                      <span role="cell" className="bd-name"><CatIcon name={r.group} custom={custom} /><span className="min-w-0"><span className="bd-trunc">{r.group}</span><span className="bd-sub bd-pct-sub">{r.pct.toFixed(r.pct < 10 ? 1 : 0)}%</span></span></span>
                      <span role="cell" className="mh-amount">{aud(r.amount)}</span>
                      <span role="cell" className="bd-col-pct">{r.pct.toFixed(r.pct < 10 ? 1 : 0)}%</span>
                      <span role="cell"><ChangeBadge change={r.change} /></span>
                    </button>
                  ))}
                  {(all || spendRows.length > 6 || rows.length < expenseNames.length) && (
                    <div className="bd-tfoot">
                      <button type="button" className="mh-btn-outline mh-btn-wide" onClick={() => setAll((a) => !a)}>{all ? "Show less" : "Show all categories"}</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bd-table" role="table" aria-label="Spending by group">
                  <div className="bd-tr bd-th bd-tr--3" role="row">
                    <span role="columnheader">Group</span>
                    <span role="columnheader">Spent</span>
                    <span role="columnheader">% of expenses</span>
                  </div>
                  {grouped.map((g, i) => (
                    <div key={g.group} className="bd-tr bd-tr--3" role="row">
                      <span role="cell" className="bd-name"><i className="bd-swatch" style={{ opacity: rampAt(i) }} aria-hidden />
                        <span className="min-w-0"><span className="bd-trunc">{g.group}</span><span className="bd-sub bd-trunc">{g.members.join(", ") || "No spending yet"}</span></span>
                      </span>
                      <span role="cell" className="mh-amount">{aud(g.amount)}</span>
                      <span role="cell">{g.pct.toFixed(g.pct < 10 ? 1 : 0)}%</span>
                    </div>
                  ))}
                  {groups.length === 0 && (
                    <div className="bd-tfoot"><p className="mh-muted mh-small m-0">Group categories together (for example “Fun” or “Home”) in <button type="button" className="mh-link-btn mh-small" onClick={onManage}>Manage categories</button>.</p></div>
                  )}
                </div>
              )}
            </>
          )
        ) : tab === "budget" ? (
          budgetError ? (
            <p className="mh-muted mh-small m-0">Your budget couldn’t load right now.</p>
          ) : budgets.length === 0 ? (
            <div className="bd-budget-empty">
              <p className="bd-serif">Create your budget</p>
              <p className="mh-muted mh-small m-0">Set a monthly budget to stay on top of your spending. Maal can suggest one from your last three months.</p>
              <Gauge pct={0} />
              <div className="bd-btn-row">
                <button type="button" className="mh-btn-ink" onClick={onAi}><Sparkles aria-hidden size={15} /> Create a budget with Maal</button>
                <button type="button" className="mh-btn-outline" onClick={onEditBudget}><Pencil aria-hidden /> Set it myself</button>
              </div>
            </div>
          ) : (
            <>
              <div className="bd-gauge-wrap">
                <Gauge pct={pct} />
                <div className="bd-gauge-text">
                  {budgetTotal > 0 && <span className="bd-gauge-pct">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>}
                  <span className="bd-gauge-amt mh-amount">{aud(spent)}</span>
                  <span className="bd-gauge-sub mh-amount">{budgetTotal > 0 ? `${aud(budgetTotal)} budget` : "spent"}</span>
                </div>
              </div>
              <div className="bd-viewby bd-viewby--split">
                <button type="button" className="mh-btn-outline" onClick={onEditBudget}><Pencil aria-hidden /> Edit budget</button>
                <span className="inline-flex items-center gap-2">
                  <label className="mh-muted mh-small" htmlFor="bd-bview">View</label>
                  <span className="so-select">
                    <select id="bd-bview" value={budgetView} onChange={(e) => setBudgetView(e.target.value as "all" | "over" | "under")}>
                      <option value="all">All budgets</option>
                      <option value="over">Over budget</option>
                      <option value="under">Within budget</option>
                    </select>
                    <ChevronDown aria-hidden />
                  </span>
                </span>
              </div>
              <div className="bd-table" role="table" aria-label="Budget by category">
                <div className="bd-tr bd-th bd-tr--budget" role="row">
                  <span role="columnheader">Category</span>
                  <span role="columnheader">Spent</span>
                  <span role="columnheader">Budget</span>
                  <span role="columnheader">Available</span>
                </div>
                {bShown.length === 0 && <div className="bd-tfoot"><p className="mh-muted mh-small m-0">Nothing to show for this view.</p></div>}
                {bShown.map((r) => {
                  const p = r.budget > 0 ? (r.spent / r.budget) * 100 : r.spent > 0 ? 100 : 0;
                  const row = (
                    <>
                      <span role="cell" className="bd-name"><CatIcon name={r.rest ? "Other" : r.group} custom={custom} /><span className="bd-trunc">{r.group}</span></span>
                      <span role="cell" className="bd-spent">
                        <span className="mh-amount">{aud(r.spent)}</span>
                        <span className="mh-bar bd-bar"><i style={{ width: `${Math.min(100, p)}%` }} data-over={p > 100} /></span>
                      </span>
                      <span role="cell" className="mh-amount">{aud(r.budget)}</span>
                      <span role="cell" className="mh-amount" data-over={r.available < 0}>{r.available < 0 ? `−${aud(-r.available)}` : aud(r.available)}</span>
                    </>
                  );
                  return r.rest ? (
                    <div key={r.group} className="bd-tr bd-tr--budget" role="row">{row}</div>
                  ) : (
                    <button key={r.group} type="button" className="bd-tr bd-tr--budget" role="row" onClick={() => onOpenCategory(r.group)}>{row}</button>
                  );
                })}
              </div>
            </>
          )
        ) : income.length === 0 ? (
          <div className="mh-empty"><p className="m-0">No income recorded {when}.</p></div>
        ) : (
          <>
            <Donut rows={income} total={incomeTotal} label={current ? "Received this month" : "Received"} privacy={privacy} />
            <div className="bd-table" role="table" aria-label="Income by source">
              <div className="bd-tr bd-th bd-tr--3" role="row">
                <span role="columnheader">Source</span>
                <span role="columnheader">Received</span>
                <span role="columnheader">% of income</span>
              </div>
              {income.map((r, i) => (
                <div key={r.group} className="bd-tr bd-tr--3" role="row">
                  <span role="cell" className="bd-name"><i className="bd-swatch" style={{ opacity: rampAt(i) }} aria-hidden /><span className="bd-trunc">{r.group}</span></span>
                  <span role="cell" className="mh-amount bd-in">{aud(r.amount)}</span>
                  <span role="cell">{r.pct.toFixed(r.pct < 10 ? 1 : 0)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </HomeCard>
  );
}
