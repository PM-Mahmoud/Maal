/** Home uses the same spending categories and budget rows as Breakdown. */
import { budgetRows, categoryBreakdown, isoDay, txnDay } from './spending-overview.mjs';
import { effectiveTransactions } from './transaction-splits.mjs';

export function homeBudgetSummary({ transactions, budgets, total, excluded, today = new Date() }) {
  const budget = Number(total);
  if (!Number.isFinite(budget) || budget <= 0) return null;

  const through = isoDay(today);
  const effective = effectiveTransactions(transactions).filter((row) => {
    const date = txnDay(row);
    return date && date <= through;
  });
  const breakdown = categoryBreakdown(effective, today.getFullYear(), today.getMonth(), excluded);
  const spent = breakdown.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const overBudget = budgetRows(breakdown, budgets)
    .filter((row) => !row.rest && row.spent > row.budget)
    .map((row) => ({ group: row.group, over: Math.round((row.spent - row.budget) * 100) / 100 }))
    .sort((a, b) => b.over - a.over || a.group.localeCompare(b.group))
    .slice(0, 3);

  return { budget, spent, overBudget };
}
