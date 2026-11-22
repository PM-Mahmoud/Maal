import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { categoryBreakdown, shiftMonth } from "../../../../../../shared/spending-overview.mjs";
import { averageMonthlyIncome, savingsTarget } from "../../../../../../shared/spending-breakdown.mjs";
import { aud } from "@/components/maal/home/format";
import { saveBudget, type Budget } from "../settings/api";
import type { SpendTxn } from "../overview/useSpendingData";
import { deleteBudget, type CustomCategory } from "./api";
import { CatIcon, ErrorLine, Toast, expenseCategories } from "./parts";

/**
 * Editing a budget (HEL-87): monthly income − monthly budget = savings target
 * on the left; the monthly budget, the category budgets and every category you
 * could add a budget to on the right. "+" / pencil open the category detail to
 * set that budget (HEL-88); "Add a custom category" opens HEL-89.
 */
export function EditBudget({ transactions, excluded, budgets, custom, today, loading, budgetError, onBack, onAi, onOpenCategory, onNewCategory, onBudgetChanged }: {
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  budgets: Budget[];
  custom: CustomCategory[];
  today: Date;
  loading: boolean;
  budgetError?: boolean;
  onBack: () => void;
  onAi: () => void;
  onOpenCategory: (name: string) => void;
  onNewCategory: () => void;
  onBudgetChanged: () => Promise<void> | void;
}) {
  const overall = budgets.find((b) => !b.category_group) || null;
  const [amount, setAmount] = useState(overall ? String(overall.monthly_amount) : "");
  useEffect(() => { setAmount(overall ? String(overall.monthly_amount) : ""); }, [overall?.monthly_amount]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const income = useMemo(() => averageMonthlyIncome(transactions, today, 3), [transactions, today]);
  const budgetNum = overall ? Number(overall.monthly_amount) : 0;
  const target = savingsTarget(income, budgetNum);
  const last = shiftMonth(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = useMemo(
    () => new Map(categoryBreakdown(transactions, last.year, last.month, excluded).map((r: { group: string; amount: number }) => [r.group, r.amount])),
    [transactions, last.year, last.month, excluded],
  );
  const catBudgets = budgets.filter((b) => b.category_group);
  const catTotal = catBudgets.reduce((a, b) => a + Number(b.monthly_amount), 0);
  const rest = overall ? Math.max(0, Math.round((budgetNum - catTotal) * 100) / 100) : null;
  const addable = expenseCategories(custom, excluded).filter((c) => !catBudgets.some((b) => b.category_group === c));

  const n = Number(String(amount).replace(/[$,\s]/g, ""));
  const valid = Number.isFinite(n) && n > 0;
  const dirty = valid && n !== budgetNum;

  async function save() {
    setBusy(true); setErr(null);
    try {
      await saveBudget({ category_group: null, monthly_amount: amount });
      await onBudgetChanged();
      setToast(overall ? "Monthly budget updated" : "Monthly budget set");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(b: Budget) {
    setBusy(true); setErr(null);
    try { await deleteBudget(b.id); await onBudgetChanged(); setToast(`${b.category_group} budget removed`); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mh-card bd-edit" aria-labelledby="bd-edit-title">
      {toast && <Toast title={toast} onClose={() => setToast(null)} />}
      <div className="mh-card-head">
        <button type="button" className="ss-iconbtn" onClick={onBack} aria-label="Back to breakdown"><ArrowLeft aria-hidden /></button>
        <h2 id="bd-edit-title" className="mh-card-label m-0 font-normal">Monthly budget</h2>
        <div className="mh-card-actions">
          <button type="button" className="mh-btn-outline" onClick={onAi} aria-label="Budget with Maal"><Sparkles aria-hidden className="bd-spark" /><span className="bd-sm-hide">Budget with Maal</span></button>
        </div>
      </div>
      {loading ? <div className="mh-skel m-5" style={{ height: 320 }} /> : budgetError ? (
        <p className="mh-muted m-5">Your budget couldn’t load right now. Please try again.</p>
      ) : (
        <div className="bd-edit-grid">
          <aside className="bd-sum" aria-label="Budget summary">
            <div><p className="bd-sum-label">Average monthly income</p><p className="bd-sum-val mh-amount">{aud(income)}</p><p className="mh-faint mh-small m-0">last 3 months</p></div>
            <span className="bd-sum-op" aria-hidden>−</span>
            <div className="bd-sum-box"><p className="bd-sum-label">Monthly budget</p><p className="bd-sum-val bd-sum-strong mh-amount">{overall ? aud(budgetNum) : "Not set"}</p></div>
            <span className="bd-sum-op" aria-hidden>=</span>
            <div>
              <p className="bd-sum-label">Savings target</p>
              <p className="bd-sum-val mh-amount" data-neg={overall ? target.savings < 0 : undefined}>{overall ? (target.savings < 0 ? `−${aud(-target.savings)}` : aud(target.savings)) : "—"}</p>
              {overall && target.pctOfIncome !== null && <p className="mh-faint mh-small m-0">{target.pctOfIncome.toFixed(0)}% of monthly income</p>}
            </div>
          </aside>

          <div className="bd-edit-main">
            <div>
              <h3 className="bd-serif bd-h3">{overall ? "Your monthly budget" : "Now, set your monthly budget"}</h3>
              <p className="mh-muted mh-small m-0">Maal takes your budget away from your income to work out what you could save.</p>
            </div>
            <form className="ss-card bd-mform" onSubmit={(e) => { e.preventDefault(); if (dirty) void save(); }}>
              <label className="bd-field">
                <span>Monthly budget</span>
                <span className="bd-field-in">$<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></span>
              </label>
              <button type="submit" className="mh-btn-ink" disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
            </form>
            {err && <ErrorLine>{err}</ErrorLine>}
            {overall && income > 0 && target.savings < 0 && (
              <p className="bd-banner" role="note"><AlertTriangle aria-hidden />This budget is more than your average income, so you’d be drawing on savings or credit. Bring it down to stay on track.</p>
            )}
            {overall && income === 0 && (
              <p className="bd-banner bd-banner--soft" role="note">No income has come into your connected accounts in the last three months, so Maal can’t work out a savings target yet.</p>
            )}

            <div>
              <h4 className="bd-h4">Category budgets</h4>
              <ul className="ss-card bd-clist">
                {catBudgets.length === 0 && !overall && <li className="bd-crow"><span className="mh-muted mh-small">No budgets yet.</span></li>}
                {catBudgets.map((b) => (
                  <li key={b.id} className="bd-crow">
                    <CatIcon name={b.category_group!} custom={custom} />
                    <span className="min-w-0 flex-1"><span className="bd-trunc">{b.category_group}</span><span className="bd-sub"><span className="mh-amount">{aud(lastMonth.get(b.category_group!) ?? 0)}</span> last month</span></span>
                    <span className="mh-amount">{aud(Number(b.monthly_amount))}</span>
                    <button type="button" className="ss-iconbtn" onClick={() => onOpenCategory(b.category_group!)} aria-label={`Edit ${b.category_group} budget`}><Pencil aria-hidden /></button>
                    <button type="button" className="ss-iconbtn bd-danger" onClick={() => remove(b)} disabled={busy} aria-label={`Remove ${b.category_group} budget`}><Trash2 aria-hidden /></button>
                  </li>
                ))}
                {rest !== null && (
                  <li className="bd-crow">
                    <CatIcon name="Other" custom={custom} />
                    <span className="min-w-0 flex-1"><span className="bd-trunc">Everything else</span><span className="bd-sub">What’s left of your monthly budget</span></span>
                    <span className="mh-amount">{aud(rest)}</span>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h4 className="bd-h4">Add a category budget</h4>
              <ul className="ss-card bd-clist">
                {addable.map((c) => (
                  <li key={c}>
                    <button type="button" className="bd-crow bd-crow-btn" onClick={() => onOpenCategory(c)}>
                      <CatIcon name={c} custom={custom} />
                      <span className="min-w-0 flex-1"><span className="bd-trunc">{c}</span><span className="bd-sub"><span className="mh-amount">{aud(lastMonth.get(c) ?? 0)}</span> last month</span></span>
                      <Plus aria-label={`Set a ${c} budget`} className="bd-plus" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="mh-link-btn bd-addcat" onClick={onNewCategory}><Plus aria-hidden size={16} /> Add a custom category</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
