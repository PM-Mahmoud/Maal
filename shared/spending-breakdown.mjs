// shared/spending-breakdown.mjs — pure maths behind Spending > Breakdown &
// budget (/app/spending/breakdown, redesign session 2, HEL-84..HEL-90) and the
// "Create a budget with Maal" suggestion (HEL-86). No I/O, no DOM. Used by the
// React page AND by the server (GET /api/v1/budgets/suggestion), and covered by
// test/spending-breakdown.test.js, per CLAUDE.md ("financial calculations must
// be covered by a deterministic test").
//
// Money is AUD. Transactions use the /api/v1/transactions shape (see
// shared/spending-overview.mjs). Sums are done in whole cents.

import {
  categoryBreakdown, countsAsSpend, groupOf, isIncome, monthlyCashFlow, shiftMonth, txnDay,
} from './spending-overview.mjs';

const num = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');
const cents = (v) => Math.round(num(v) * 100);

/** "YYYY-MM" for (year, month 0-11). */
export function monthKey(year, month) {
  return `${year}-${pad2(month + 1)}`;
}

/** Earliest "YYYY-MM" that has any transaction, or null. */
export function firstDataKey(txns) {
  let min = null;
  for (const t of txns || []) {
    const d = txnDay(t);
    if (d && (min === null || d < min)) min = d;
  }
  return min ? min.slice(0, 7) : null;
}

/**
 * Category table for one month with the change against the month before.
 * `include` lists categories to show even at $0 (e.g. every category with a
 * budget, or "show all"). Each row: { group, amount, pct, prev, change } where
 * change is the % move from last month, or null when last month was $0 and
 * this month isn't (shown as "New"). Largest first, then by name.
 */
export function breakdownTable(txns, year, month, excluded, include = []) {
  const now = categoryBreakdown(txns, year, month, excluded);
  const p = shiftMonth(year, month, 1);
  const before = new Map(categoryBreakdown(txns, p.year, p.month, excluded).map((r) => [r.group, r.amount]));
  const rows = new Map(now.map((r) => [r.group, r]));
  for (const g of include || []) if (!rows.has(g)) rows.set(g, { group: g, amount: 0, pct: 0 });
  return [...rows.values()]
    .map((r) => {
      const prev = before.get(r.group) || 0;
      const change = prev > 0 ? round2(((r.amount - prev) / prev) * 100) : r.amount > 0 ? null : 0;
      return { group: r.group, amount: r.amount, pct: r.pct, prev, change };
    })
    .sort((a, b) => b.amount - a.amount || a.group.localeCompare(b.group));
}

/**
 * Roll a breakdownTable up into the user's category groups. `groups` =
 * [{ name, categories }]; categories in no group roll into `ungrouped`.
 * Returns [{ group, amount, pct, members }] largest first; pct is the share of
 * the month's spend.
 */
export function groupRollup(rows, groups, ungrouped = 'Ungrouped') {
  const owner = new Map();
  for (const g of groups || []) for (const c of g.categories || []) owner.set(c, g.name);
  const by = new Map();
  let total = 0;
  for (const r of rows || []) {
    const name = owner.get(r.group) || ungrouped;
    const e = by.get(name) || { group: name, c: 0, members: [] };
    e.c += cents(r.amount);
    e.members.push(r.group);
    by.set(name, e);
    total += cents(r.amount);
  }
  for (const g of groups || []) if (!by.has(g.name)) by.set(g.name, { group: g.name, c: 0, members: [] });
  return [...by.values()]
    .map((e) => ({ group: e.group, amount: e.c / 100, pct: total ? round2((e.c / total) * 100) : 0, members: e.members }))
    .sort((a, b) => b.amount - a.amount || a.group.localeCompare(b.group));
}

/**
 * Income for one month by source: Income-group rows split by sub-category
 * (Salary & wages, Interest, …); rows filed under one of `incomeCategories`
 * (custom income categories) by that name; any other money in (refunds etc.)
 * is "Other income". Transfers between the user's own accounts never count.
 */
export function incomeTable(txns, year, month, incomeCategories = []) {
  const key = monthKey(year, month);
  const by = new Map();
  let total = 0;
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d || d.slice(0, 7) !== key || !isIncome(t)) continue;
    const g = groupOf(t);
    const label = g === 'Income' ? (t.category || 'Income') : (incomeCategories || []).includes(g) ? g : 'Other income';
    const c = cents(t.amount);
    by.set(label, (by.get(label) || 0) + c);
    total += c;
  }
  return [...by.entries()]
    .map(([group, c]) => ({ group, amount: c / 100, pct: total ? round2((c / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount || a.group.localeCompare(b.group));
}

/** Income, expenses and net for one month (spending rule as the overview). */
export function monthCashFlow(txns, year, month, excluded) {
  const [row] = monthlyCashFlow(txns, year, month, 1, excluded);
  return { income: row.income, expenses: row.expenses, net: row.net };
}

/** The month's `n` biggest spending transactions (amount positive). */
export function largestExpenses(txns, year, month, excluded, n = 3) {
  const key = monthKey(year, month);
  return (txns || [])
    .filter((t) => txnDay(t)?.slice(0, 7) === key && countsAsSpend(t, excluded))
    .map((t) => ({ ...t, spend: round2(-num(t.amount)) }))
    .sort((a, b) => b.spend - a.spend || String(txnDay(b)).localeCompare(String(txnDay(a))))
    .slice(0, n);
}

/** Merchants the user paid most often this month: [{ merchant, count, total, group }]. */
export function frequentExpenses(txns, year, month, excluded, n = 3) {
  const key = monthKey(year, month);
  const by = new Map();
  for (const t of txns || []) {
    if (txnDay(t)?.slice(0, 7) !== key || !countsAsSpend(t, excluded)) continue;
    const merchant = String(t.merchant || t.description || 'Unknown').trim() || 'Unknown';
    const e = by.get(merchant) || { merchant, count: 0, c: 0, group: groupOf(t) };
    e.count += 1;
    e.c += -cents(t.amount);
    by.set(merchant, e);
  }
  return [...by.values()]
    .filter((e) => e.count > 1)
    .sort((a, b) => b.count - a.count || b.c - a.c || a.merchant.localeCompare(b.merchant))
    .slice(0, n)
    .map((e) => ({ merchant: e.merchant, count: e.count, total: e.c / 100, group: e.group }));
}

/**
 * Budget table rows: budgetRows()-style progress plus what's available.
 * `rows` = shared/spending-overview.mjs budgetRows() output.
 */
export function withAvailable(rows) {
  return (rows || []).map((r) => ({ ...r, available: round2(num(r.budget) - num(r.spent)) }));
}

/** Monthly spend in one category for the `months` months ending at (endYear, endMonth), oldest first. */
export function categoryHistory(txns, category, endYear, endMonth, months, excluded) {
  const rows = [];
  const index = new Map();
  for (let k = months - 1; k >= 0; k--) {
    const { year, month } = shiftMonth(endYear, endMonth, k);
    index.set(monthKey(year, month), rows.length);
    rows.push({ key: monthKey(year, month), year, month, c: 0 });
  }
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d || groupOf(t) !== category || !countsAsSpend(t, excluded)) continue;
    const i = index.get(d.slice(0, 7));
    if (i !== undefined) rows[i].c += -cents(t.amount);
  }
  return rows.map(({ key, year, month, c }) => ({ key, year, month, amount: c / 100 }));
}

/**
 * Averages over complete months only: every month before `currentKey`, back
 * to the first month the user has any data (`fromKey`) so a new user's
 * average isn't diluted by months before they joined.
 * Returns { lastMonth, average, months }.
 */
export function historyStats(history, currentKey, fromKey) {
  const done = (history || []).filter((h) => h.key < currentKey && (!fromKey || h.key >= fromKey));
  const last = done.length ? done[done.length - 1] : null;
  const total = done.reduce((a, h) => a + cents(h.amount), 0);
  return {
    lastMonth: last && last.key === prevKey(currentKey) ? last.amount : 0,
    average: done.length ? Math.round(total / done.length) / 100 : 0,
    months: done.length,
  };
}

function prevKey(key) {
  const [y, m] = key.split('-').map(Number);
  const p = shiftMonth(y, m - 1, 1);
  return monthKey(p.year, p.month);
}

/** Average monthly income over the complete months in the `months` before the current one (data months only). */
export function averageMonthlyIncome(txns, today = new Date(), months = 3) {
  const prev = shiftMonth(today.getFullYear(), today.getMonth(), 1);
  const from = firstDataKey(txns);
  const rows = monthlyCashFlow(txns, prev.year, prev.month, months, []).filter((r) => from && r.key >= from);
  if (!rows.length) return 0;
  return Math.round(rows.reduce((a, r) => a + cents(r.income), 0) / rows.length) / 100;
}

/** Savings target = income − budget, with its share of income (null when no income). */
export function savingsTarget(income, budget) {
  const i = cents(income);
  const s = i - cents(budget);
  return { savings: s / 100, pctOfIncome: i > 0 ? round2((s / i) * 100) : null };
}

/**
 * What a category budget may use: the overall budget less every OTHER
 * category budget. Null when there's no overall budget.
 */
export function availableForCategory(budgets, category) {
  const list = Array.isArray(budgets) ? budgets : [];
  const overall = list.find((b) => !b.category_group);
  if (!overall) return null;
  const others = list.filter((b) => b.category_group && b.category_group !== category)
    .reduce((a, b) => a + cents(b.monthly_amount), 0);
  return (cents(overall.monthly_amount) - others) / 100;
}

// ---------------------------------------------------------------------------
// Budget suggestion (HEL-86). Deterministic: the model may only word it.
// ---------------------------------------------------------------------------

const roundTo = (x, step) => Math.round(x / step) * step;
const floorTo = (x, step) => Math.floor(x / step) * step;
const ceilTo = (x, step) => Math.ceil(x / step) * step;

/** Months and transactions needed before a suggestion means anything. */
export const MIN_SPEND_TXNS = 5;
export const SUGGEST_MONTHS = 3;
/** Most a suggestion trims from typical spend in one go. */
export const MAX_TRIM = 0.15;
/** Savings rate the suggestion steers towards when income allows. */
export const TARGET_SAVINGS_RATE = 0.2;

/**
 * Suggest a monthly budget from the last three complete months.
 *
 * Rule: start from average monthly spending. If income is high enough that
 * this already leaves 20% or more of income unspent, keep spending where it
 * is. Otherwise aim for spending at 80% of income, but never cut more than
 * 15% below what the user typically spends (an achievable step). With no
 * income recorded, trim typical spending by 15%. Rounded to the nearest $10.
 *
 * Category budgets: the biggest categories (up to 6, average ≥ $10/month)
 * scaled by the same ratio, rounded to $5, dropping the smallest until they
 * fit inside the monthly budget.
 *
 * Returns { enoughData, monthsUsed, months[], avgIncome, avgExpenses,
 * avgSavings, suggested, range{min,max}, slider{min,max,step}, categories[],
 * facts[] } — every figure is computed here; facts carry numbers only.
 */
export function suggestBudget(txns, today = new Date(), excluded) {
  const prev = shiftMonth(today.getFullYear(), today.getMonth(), 1);
  const from = firstDataKey(txns);
  const window = monthlyCashFlow(txns, prev.year, prev.month, SUGGEST_MONTHS, excluded);
  const used = window.filter((r) => from && r.key >= from);
  const usedKeys = new Set(used.map((r) => r.key));
  const spendCount = (txns || []).filter((t) => {
    const d = txnDay(t);
    return d && usedKeys.has(d.slice(0, 7)) && countsAsSpend(t, excluded);
  }).length;
  const months = used.map((r) => ({ key: r.key, year: r.year, month: r.month, income: r.income, expenses: r.expenses, net: r.net }));
  const base = { monthsUsed: used.length, months, spendCount };
  if (!used.length || spendCount < MIN_SPEND_TXNS) {
    return { enoughData: false, ...base, avgIncome: 0, avgExpenses: 0, avgSavings: 0, suggested: 0,
      range: { min: 0, max: 0 }, slider: { min: 0, max: 0, step: 10 }, categories: [], facts: [] };
  }
  const n = used.length;
  const incC = Math.round(used.reduce((a, r) => a + cents(r.income), 0) / n);
  const expC = Math.round(used.reduce((a, r) => a + cents(r.expenses), 0) / n);
  const avgIncome = incC / 100;
  const avgExpenses = expC / 100;
  const avgSavings = (incC - expC) / 100;

  let target;
  if (avgIncome > 0 && avgIncome * (1 - TARGET_SAVINGS_RATE) >= avgExpenses) target = avgExpenses;
  else if (avgIncome > 0) target = Math.max(avgExpenses * (1 - MAX_TRIM), avgIncome * (1 - TARGET_SAVINGS_RATE));
  else target = avgExpenses * (1 - MAX_TRIM);
  const suggested = Math.max(10, roundTo(target, 10));
  const range = { min: Math.max(10, floorTo(suggested * 0.8, 10)), max: ceilTo(suggested * 1.2, 10) };
  const slider = {
    min: Math.max(10, floorTo(suggested * 0.5, 10)),
    max: Math.max(ceilTo(suggested * 1.5, 10), ceilTo(avgExpenses * 1.2, 10)),
    step: 10,
  };

  // Average spend per category over the used months.
  const catC = new Map();
  for (const r of used) {
    for (const c of categoryBreakdown(txns, r.year, r.month, excluded)) {
      catC.set(c.group, (catC.get(c.group) || 0) + cents(c.amount));
    }
  }
  const scale = avgExpenses > 0 ? Math.min(1, suggested / avgExpenses) : 1;
  let categories = [...catC.entries()]
    .map(([group, c]) => ({ group, average: Math.round(c / n) / 100 }))
    .filter((c) => c.average >= 10)
    .sort((a, b) => b.average - a.average || a.group.localeCompare(b.group))
    .slice(0, 6)
    .map((c) => ({ ...c, budget: Math.max(5, roundTo(c.average * scale, 5)) }));
  while (categories.length && categories.reduce((a, c) => a + c.budget, 0) > suggested) categories = categories.slice(0, -1);

  const facts = [];
  const negMonths = used.filter((r) => r.net < 0).length;
  if (avgIncome <= 0) facts.push({ id: 'no_income', months: n });
  if (avgIncome > 0 && avgSavings < 0) facts.push({ id: 'negative_cash_flow', months: n, negativeMonths: negMonths, shortfall: round2(-avgSavings) });
  if (avgIncome > 0 && avgSavings >= 0) {
    facts.push({ id: 'saving', months: n, savings: avgSavings, rate: round2((avgSavings / avgIncome) * 100) });
  }
  const top = [...catC.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (top && expC > 0) {
    facts.push({ id: 'top_category', category: top[0], average: Math.round(top[1] / n) / 100, share: round2((top[1] / n / expC) * 100) });
  }
  const other = catC.get('Other') || 0;
  if (expC > 0 && other / n / expC >= 0.15) {
    facts.push({ id: 'uncategorised', average: Math.round(other / n) / 100, share: round2((other / n / expC) * 100) });
  }

  return { enoughData: true, ...base, avgIncome, avgExpenses, avgSavings, suggested, range, slider, categories, facts };
}

/**
 * The "your potential savings" panel for a chosen budget.
 * { budget, monthlySaving (income − budget; null without income),
 *   overIncome (budget − income when the budget is higher, else 0),
 *   vsTypical (typical spend − budget; negative = above typical), tone }.
 * tone is 'warn' when the budget is above income or above typical spend.
 */
export function potentialSavings(budget, avgIncome, avgExpenses) {
  const b = cents(budget);
  const i = cents(avgIncome);
  const e = cents(avgExpenses);
  const over = i > 0 && b > i ? (b - i) / 100 : 0;
  return {
    budget: b / 100,
    monthlySaving: i > 0 ? (i - b) / 100 : null,
    overIncome: over,
    vsTypical: (e - b) / 100,
    tone: over > 0 || b > e ? 'warn' : 'good',
  };
}

/** Every figure a suggestion's wording may mention (for the server's number check). */
export function allowedFigures(s) {
  const out = new Set([SUGGEST_MONTHS, s.monthsUsed, TARGET_SAVINGS_RATE * 100, (1 - TARGET_SAVINGS_RATE) * 100, MAX_TRIM * 100]);
  const add = (v) => { if (Number.isFinite(v)) { out.add(round2(Math.abs(v))); out.add(Math.round(Math.abs(v))); } };
  [s.avgIncome, s.avgExpenses, s.avgSavings, s.suggested, s.range.min, s.range.max].forEach(add);
  for (const m of s.months || []) [m.income, m.expenses, m.net].forEach(add);
  for (const c of s.categories || []) [c.average, c.budget].forEach(add);
  for (const f of s.facts || []) for (const v of Object.values(f)) if (typeof v === 'number') add(v);
  return [...out];
}
