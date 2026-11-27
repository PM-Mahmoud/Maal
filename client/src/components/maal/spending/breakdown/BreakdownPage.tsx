import { useMemo, useRef, useState } from "react";
import { monthKey } from "../../../../../../shared/spending-breakdown.mjs";
import { TransactionDetailMount } from "../transaction-detail/TransactionDetailMount";
import { AiBudgetBuilder } from "./AiBudgetBuilder";
import { BreakdownCard, type Tab } from "./BreakdownCard";
import { CategoryDetailDrawer } from "./CategoryDetailDrawer";
import { EditBudget } from "./EditBudget";
import { ManageCategoriesDrawer } from "./ManageCategoriesDrawer";
import { NewCategoryDrawer } from "./NewCategoryDrawer";
import { PeriodCard } from "./PeriodCard";
import { CashFlowCard, FrequentCard, LargestCard } from "./SideCards";
import { Toast, monthLabel } from "./parts";
import { useBreakdownData } from "./useBreakdownData";
import "@/components/maal/home/home.css";
import "../overview/overview.css";
import "./breakdown.css";

export type BreakdownSearch = {
  month?: string;
  tab?: Tab;
  cat?: string;
  panel?: "edit" | "manage" | "ai";
};

/**
 * Spending › Breakdown & budget (/app/spending/breakdown, Session 2,
 * HEL-84..HEL-90). URL state: ?month=YYYY-MM, ?tab=expenses|budget|income,
 * ?cat=<category> opens the category detail drawer, ?panel=edit shows the
 * monthly budget editor in place of the page, ?panel=manage opens Manage
 * categories, ?panel=ai opens "Create a budget with Maal".
 * Maths: shared/spending-breakdown.mjs (test/spending-breakdown.test.js).
 */
export function BreakdownPage({ search, setSearch }: { search: BreakdownSearch; setSearch: (patch: Partial<BreakdownSearch>) => void }) {
  const data = useBreakdownData();
  const today = useMemo(() => new Date(), []);
  const curKey = monthKey(today.getFullYear(), today.getMonth());
  const key = search.month && /^\d{4}-\d{2}$/.test(search.month) && search.month <= curKey ? search.month : curKey;
  const [year, m1] = key.split("-").map(Number);
  const month = m1 - 1;
  const tab: Tab = search.tab ?? "expenses";
  const excluded = data.settings?.excluded_groups;
  const [newCat, setNewCat] = useState<null | "expense" | "income">(null);
  const [toast, setToast] = useState<{ title: string; text?: string } | null>(null);

  const common = { transactions: data.transactions, excluded, year, month, loading: data.loading, error: data.errors.transactions };
  const categoryTrigger = useRef<HTMLButtonElement | null>(null);
  function openCategory(name: string, trigger: HTMLButtonElement) {
    categoryTrigger.current = trigger;
    setSearch({ cat: name });
  }

  const reloadAfterBudget = async () => { await data.reloadBudgets(); };

  return (
    <div className="mh bd">
      <div className="mh-page bd-page">
        <div className="bd-head">
          <h1 className="sr-only">Breakdown and budget</h1>
          <p className="so-month">{monthLabel(year, month)}</p>
        </div>

        {search.panel === "edit" ? (
          <div className="bd-edit-wrap">
            <EditBudget transactions={data.transactions} excluded={excluded} budgets={data.budgets} custom={data.custom} today={today}
              loading={data.loading} budgetError={data.errors.budgets}
              onBack={() => setSearch({ panel: undefined, tab: "budget" })}
              onAi={() => setSearch({ panel: "ai" })}
              onOpenCategory={openCategory}
              onNewCategory={() => setNewCat("expense")}
              onBudgetChanged={reloadAfterBudget} />
          </div>
        ) : (
          <>
            <PeriodCard {...common} today={today} onPick={(y, mo) => setSearch({ month: monthKey(y, mo) === curKey ? undefined : monthKey(y, mo) })} />
            <div className="mh-grid bd-grid">
              <div className="mh-col">
                <BreakdownCard {...common} tab={tab} onTab={(t) => setSearch({ tab: t === "expenses" ? undefined : t })}
                  budgets={data.budgets} custom={data.custom} groups={data.groups} current={key === curKey}
                  budgetError={data.errors.budgets}
                  onOpenCategory={openCategory}
                  onEditBudget={() => setSearch({ panel: "edit" })}
                  onAi={() => setSearch({ panel: "ai" })}
                  onManage={() => setSearch({ panel: "manage" })} />
              </div>
              <aside className="mh-col" aria-label="Month summary">
                <CashFlowCard {...common} />
                <LargestCard {...common} custom={data.custom} />
                <FrequentCard {...common} custom={data.custom} />
              </aside>
            </div>
          </>
        )}
      </div>

      {toast && <div className="bd-page-toast"><Toast title={toast.title} text={toast.text} onClose={() => setToast(null)} /></div>}

      {search.cat && (
        <CategoryDetailDrawer name={search.cat} transactions={data.transactions} excluded={excluded} budgets={data.budgets}
          custom={data.custom} today={today} onClose={() => setSearch({ cat: undefined })} onBudgetChanged={reloadAfterBudget}
          onCloseAutoFocus={(event) => {
            const trigger = categoryTrigger.current;
            categoryTrigger.current = null;
            if (trigger?.isConnected) {
              event.preventDefault();
              trigger.focus();
            }
          }} />
      )}
      {search.panel === "manage" && (
        <ManageCategoriesDrawer custom={data.custom} groups={data.groups} onClose={() => setSearch({ panel: undefined })}
          onChanged={data.reload}
          onNewCategory={(k) => setNewCat(k)} />
      )}
      {newCat && (
        <NewCategoryDrawer groups={data.groups} defaultKind={newCat} onClose={() => setNewCat(null)}
          onCreated={async (c) => {
            setNewCat(null);
            await data.reloadCategories();
            setToast({ title: "Category created", text: `“${c.name}” was added to your categories.` });
          }} />
      )}
      {search.panel === "ai" && (
        <AiBudgetBuilder onClose={() => setSearch({ panel: undefined, tab: "budget" })}
          onManual={() => setSearch({ panel: "edit" })} onSaved={reloadAfterBudget} />
      )}
      <TransactionDetailMount onChanged={() => void data.reload()} />
    </div>
  );
}
