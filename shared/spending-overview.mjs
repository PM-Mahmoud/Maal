// shared/spending-overview.mjs — pure maths behind the Spending overview page
// (/app/spending, redesign session 2, HEL-83). No I/O, no DOM: the React page
// imports these and test/spending-overview.test.js covers them, per CLAUDE.md
// ("financial calculations must be covered by a deterministic test").
//
// Money is AUD. Transactions use the /api/v1/transactions shape: signed
// `amount` (negative = money out, BIGINT/NUMERIC may arrive as strings),
// `post_date` (ISO date or timestamp), `category_group` (18-group AU taxonomy,
// lib/transaction-categories.js) and optional `relationship_type` (set when the
// row is one leg of a transfer / card repayment pair).
//
// "Counts as spending" mirrors lib/spending-settings.js countsAsSpending():
// a debit whose category group is not in the user's excluded groups.

/** Same defaults as lib/spending-settings.js DEFAULT_EXCLUDED_GROUPS. */
export const DEFAULT_EXCLUDED_GROUPS = Object.freeze(["Income", "Credit Card Payments", "Transfers"]);

/** Groups that only move money between the user's own accounts. */
const MOVEMENT_GROUPS = ["Transfers", "Credit Card Payments"];

const CADENCE_DAYS = { weekly: 7, fortnightly: 14, monthly: 30, yearly: 365 };

const num = (v) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for a local Date. */
export function isoDay(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The transaction's calendar day as "YYYY-MM-DD", or null. */
export function txnDay(t) {
  const raw = t && (t.post_date || t.date || t.transaction_date);
  if (!raw) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Category group, falling back to a text sniff for legacy rows without one. */
export function groupOf(t) {
  if (t && t.category_group) return t.category_group;
  const text = `${t?.category || ""} ${t?.category_name || ""} ${t?.group || ""}`.toLowerCase();
  if (text.includes("transfer")) return "Transfers";
  return "Other";
}

function excludedList(excluded) {
  return Array.isArray(excluded) ? excluded : [...DEFAULT_EXCLUDED_GROUPS];
}

/** Does this transaction count towards spending under the user's settings? */
export function countsAsSpend(t, excluded) {
  if (num(t?.amount) >= 0) return false;
  if (t.relationship_type) return false; // one leg of an own-account transfer
  return !excludedList(excluded).includes(groupOf(t));
}

/** Money in that is real income (not a transfer back from the user's own account). */
export function isIncome(t) {
  if (num(t?.amount) <= 0) return false;
  if (t.relationship_type) return false;
  return !MOVEMENT_GROUPS.includes(groupOf(t));
}

/**
 * Daily and cumulative spending for one month.
 * Returns { days, total, daily, cumulative } where daily/cumulative have one
 * entry per day of the month and are null for days after `today` when the
 * month is the current one (so the chart line stops at today).
 */
export function monthCumulative(txns, year, month /* 0-11 */, excluded, today = new Date()) {
  const days = new Date(year, month + 1, 0).getDate();
  const cents = Array.from({ length: days }, () => 0);
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d) continue;
    const [y, m, dd] = d.split("-").map(Number);
    if (y !== year || m !== month + 1) continue;
    if (!countsAsSpend(t, excluded)) continue;
    cents[dd - 1] += Math.round(-num(t.amount) * 100);
  }
  const isCurrent = today.getFullYear() === year && today.getMonth() === month;
  const isFuture = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());
  const lastDay = isFuture ? 0 : isCurrent ? today.getDate() : days;
  let run = 0;
  const daily = [];
  const cumulative = [];
  for (let i = 0; i < days; i++) {
    run += cents[i];
    const shown = i + 1 <= lastDay;
    daily.push(shown ? cents[i] / 100 : null);
    cumulative.push(shown ? run / 100 : null);
  }
  const totalCents = cents.slice(0, lastDay).reduce((a, b) => a + b, 0);
  return { days, total: totalCents / 100, daily, cumulative };
}

/** Month `offset` months before (year, month): returns { year, month }. */
export function shiftMonth(year, month, offset) {
  const d = new Date(year, month - offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Budget use. `upcoming` (bills still due this month) only counts when the
 * user has "include upcoming" on. Returns null when there is no budget.
 */
export function budgetUsage({ spent, budget, upcoming = 0, includeUpcoming = false }) {
  const b = num(budget);
  if (!(b > 0)) return null;
  const used = round2(num(spent) + (includeUpcoming ? num(upcoming) : 0));
  return {
    budget: round2(b),
    used,
    pct: round2((used / b) * 100),
    remaining: round2(b - used),
    over: used > b,
  };
}

/**
 * Spending by category group for one month, largest first.
 * Each row: { group, amount, pct } where pct is the share of the month's spend.
 */
export function categoryBreakdown(txns, year, month, excluded) {
  const by = new Map();
  let total = 0;
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d) continue;
    const [y, m] = d.split("-").map(Number);
    if (y !== year || m !== month + 1 || !countsAsSpend(t, excluded)) continue;
    const c = Math.round(-num(t.amount) * 100);
    const g = groupOf(t);
    by.set(g, (by.get(g) || 0) + c);
    total += c;
  }
  return [...by.entries()]
    .map(([group, c]) => ({ group, amount: c / 100, pct: total ? round2((c / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount || a.group.localeCompare(b.group));
}

/**
 * Per-category budget progress rows. Budgets with a category_group get their
 * own row; when an overall budget (category_group null) exists, the spend in
 * every category without its own budget is shown as "Everything else" against
 * whatever is left of the overall budget after the category budgets.
 */
export function budgetRows(breakdown, budgets) {
  const list = Array.isArray(budgets) ? budgets : [];
  const spentBy = new Map((breakdown || []).map((r) => [r.group, r.amount]));
  const rows = [];
  let catBudgetCents = 0;
  const budgeted = new Set();
  for (const b of list) {
    if (!b.category_group) continue;
    const amt = num(b.monthly_amount);
    catBudgetCents += Math.round(amt * 100);
    budgeted.add(b.category_group);
    const spent = spentBy.get(b.category_group) || 0;
    rows.push({ group: b.category_group, spent, budget: round2(amt), pct: amt > 0 ? round2((spent / amt) * 100) : 0 });
  }
  rows.sort((a, b) => b.pct - a.pct || a.group.localeCompare(b.group));
  const overall = list.find((b) => !b.category_group);
  if (overall) {
    const restBudget = Math.max(0, Math.round(num(overall.monthly_amount) * 100) - catBudgetCents) / 100;
    const restSpent = round2((breakdown || []).filter((r) => !budgeted.has(r.group)).reduce((a, r) => a + r.amount, 0));
    rows.push({
      group: "Everything else", spent: restSpent, budget: restBudget,
      pct: restBudget > 0 ? round2((restSpent / restBudget) * 100) : 0, rest: true,
    });
  }
  return rows;
}

/**
 * Project recurring payments (GET /v1/transactions/recurring rows) onto the
 * days between `from` and `to` inclusive ("YYYY-MM-DD"). Each recurring row
 * repeats from its nextEstimate by its cadence. Returns [{ date, merchant,
 * amount, kind }] sorted by date; amount is positive (the expected size).
 */
export function projectRecurring(recurring, from, to, kinds = ["bill", "subscription"]) {
  const out = [];
  const end = new Date(`${to}T00:00:00`);
  const start = new Date(`${from}T00:00:00`);
  for (const r of recurring || []) {
    if (!kinds.includes(r.kind || "bill")) continue;
    const step = CADENCE_DAYS[r.cadence];
    if (!step || !r.nextEstimate) continue;
    let d = new Date(`${String(r.nextEstimate).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const amount = round2(Math.abs(num(r.averageAmount ?? r.amount)));
    for (let guard = 0; d <= end && guard < 60; guard++) {
      if (d >= start) out.push({ date: isoDay(d), merchant: r.merchant || "Recurring payment", amount, kind: r.kind || "bill" });
      // Monthly/yearly step by calendar months so the day of month holds.
      if (r.cadence === "monthly") d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
      else if (r.cadence === "yearly") d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
      else d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/** Total of projected payments due after `today` and on/before the month's last day. */
export function upcomingThisMonth(recurring, today = new Date()) {
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (tomorrow > last) return 0;
  const items = projectRecurring(recurring, isoDay(tomorrow), isoDay(last));
  return round2(items.reduce((a, i) => a + i.amount, 0));
}

/** 14 local Dates: Sunday of this week through Saturday of next week. */
export function twoWeekWindow(today = new Date()) {
  const sun = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  return Array.from({ length: 14 }, (_, i) => new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i));
}

/** Blank cells before day 1 in a Monday-first month grid. */
export function mondayOffset(year, month) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

/**
 * Monthly income / expenses / net for the `months` months ending at
 * (endYear, endMonth), oldest first. Expenses use the spending rule above.
 */
export function monthlyCashFlow(txns, endYear, endMonth, months, excluded) {
  const rows = [];
  const index = new Map();
  for (let k = months - 1; k >= 0; k--) {
    const { year, month } = shiftMonth(endYear, endMonth, k);
    const key = `${year}-${pad2(month + 1)}`;
    index.set(key, rows.length);
    rows.push({ key, year, month, inC: 0, outC: 0 });
  }
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d) continue;
    const i = index.get(d.slice(0, 7));
    if (i === undefined) continue;
    const c = Math.round(num(t.amount) * 100);
    if (isIncome(t)) rows[i].inC += c;
    else if (countsAsSpend(t, excluded)) rows[i].outC += -c;
  }
  return rows.map(({ key, year, month, inC, outC }) => ({
    key, year, month, income: inC / 100, expenses: outC / 100, net: (inC - outC) / 100,
  }));
}

/** Totals strip for a monthlyCashFlow() result. */
export function cashFlowSummary(rows) {
  const list = rows || [];
  const inC = list.reduce((a, r) => a + Math.round(r.income * 100), 0);
  const outC = list.reduce((a, r) => a + Math.round(r.expenses * 100), 0);
  const net = inC - outC;
  return {
    income: inC / 100,
    expenses: outC / 100,
    net: net / 100,
    avgPerMonth: list.length ? round2(net / 100 / list.length) : 0,
  };
}

function merchantOf(t) {
  return String(t.merchant || t.description || "Unknown").trim() || "Unknown";
}

function topN(map, n) {
  const all = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = all.slice(0, n);
  const tailC = all.slice(n).reduce((a, [, c]) => a + c, 0);
  if (tailC > 0) head.push(["Everything else", tailC]);
  return head;
}

/**
 * Sankey grouping for transactions whose day falls in [fromKey, toKey]
 * ("YYYY-MM" inclusive). Sources = income by category (or merchant), targets =
 * spending by category group (or merchant), each capped to `top` nodes plus
 * "Everything else". Amounts positive; pct is the share within its side.
 */
export function sankeyFlows(txns, fromKey, toKey, excluded, by = "category", top = 6) {
  const inMap = new Map();
  const outMap = new Map();
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d) continue;
    const k = d.slice(0, 7);
    if (k < fromKey || k > toKey) continue;
    const c = Math.round(num(t.amount) * 100);
    if (isIncome(t)) {
      // Income-group rows split by sub-category (Salary & wages, Interest, …);
      // money in under any other group (e.g. a refund) is "Other income".
      const label = by === "merchant" ? merchantOf(t)
        : groupOf(t) === "Income" ? (t.category || "Income") : "Other income";
      inMap.set(label, (inMap.get(label) || 0) + c);
    } else if (countsAsSpend(t, excluded)) {
      const label = by === "merchant" ? merchantOf(t) : groupOf(t);
      outMap.set(label, (outMap.get(label) || 0) + -c);
    }
  }
  const side = (entries) => {
    const total = entries.reduce((a, [, c]) => a + c, 0);
    return {
      total: total / 100,
      nodes: entries.map(([label, c]) => ({ label, amount: c / 100, pct: total ? round2((c / total) * 100) : 0 })),
    };
  };
  const sources = side(topN(inMap, top));
  const targets = side(topN(outMap, top));
  return { sources: sources.nodes, targets: targets.nodes, totalIn: sources.total, totalOut: targets.total };
}
