// shared/spending-reports.mjs — pure maths behind the Spending Reports page
// (/app/spending/reports, redesign session 2, HEL-106/HEL-107). No I/O, no
// DOM: the React page imports these and test/spending-reports.test.js covers
// them, per CLAUDE.md ("financial calculations must be covered by a
// deterministic test").
//
// Builds on shared/spending-overview.mjs (same spending/income rules, same
// transaction shape: signed `amount`, `post_date`, `category_group`, optional
// `relationship_type`). Money is AUD and summed in whole cents.

import { countsAsSpend, groupOf, isIncome, isoDay, txnDay } from "./spending-overview.mjs";

/** Report tabs (what kind of money the report looks at). */
export const REPORT_TABS = Object.freeze(["cashflow", "expenses", "income", "transfers"]);
/** Date-range presets. "custom" uses explicit from/to. */
export const RANGE_PRESETS = Object.freeze(["this-month", "last-month", "3m", "6m", "12m", "ytd", "fy", "last-fy", "custom"]);
/** Period grouping for bars and tables. */
export const INTERVALS = Object.freeze(["week", "month", "quarter"]);
/** Longest range the reports endpoint serves (keep in step with lib/report-views.js). */
export const MAX_RANGE_DAYS = 1096;

/** Groups that only move money between the user's own accounts. */
const MOVEMENT_GROUPS = ["Transfers", "Credit Card Payments"];

const num = (v) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const cents = (v) => Math.round(num(v) * 100);

/** Local Date for "YYYY-MM-DD" (null if malformed). */
export function parseDay(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

/** Whole days from a to b (local calendar days, DST-safe). */
export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Start year of the Australian financial year (1 July – 30 June) containing d. */
export function fyStartYear(d) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Resolve a range config to concrete days.
 * range = { preset, from?, to? } → { from, to, preset, custom } ("YYYY-MM-DD"),
 * or null when a custom range is invalid (bad dates, from > to, too long).
 * Rolling presets ("3m", "6m", "12m") cover whole months ending this month,
 * so every bar is a full calendar month except the current one.
 */
export function resolveRange(range, today = new Date()) {
  const preset = range && RANGE_PRESETS.includes(range.preset) ? range.preset : "6m";
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = t.getFullYear();
  const m = t.getMonth();
  let from;
  let to = t;
  switch (preset) {
    case "this-month": from = new Date(y, m, 1); break;
    case "last-month": from = new Date(y, m - 1, 1); to = new Date(y, m, 0); break;
    case "3m": from = new Date(y, m - 2, 1); break;
    case "12m": from = new Date(y, m - 11, 1); break;
    case "ytd": from = new Date(y, 0, 1); break;
    case "fy": from = new Date(fyStartYear(t), 6, 1); break;
    case "last-fy": from = new Date(fyStartYear(t) - 1, 6, 1); to = new Date(fyStartYear(t), 5, 30); break;
    case "custom": {
      const f = parseDay(range.from);
      const e = parseDay(range.to);
      if (!f || !e || f > e || daysBetween(f, e) + 1 > MAX_RANGE_DAYS) return null;
      from = f; to = e;
      break;
    }
    default: from = new Date(y, m - 5, 1); // "6m"
  }
  return { preset, custom: preset === "custom", from: isoDay(from), to: isoDay(to) };
}

/** Human label for a preset (custom → "Custom"). */
export function presetLabel(preset) {
  return ({
    "this-month": "This month", "last-month": "Last month", "3m": "Last 3 months", "6m": "Last 6 months",
    "12m": "Last 12 months", ytd: "Year to date", fy: "This financial year", "last-fy": "Last financial year", custom: "Custom",
  })[preset] || "Last 6 months";
}

/**
 * Consecutive periods covering [from, to] (inclusive "YYYY-MM-DD").
 * Weeks start Monday; quarters are calendar quarters (Jul–Sep is FY Q1).
 * Each period: { key, start, end } where start/end are clipped to the range.
 */
export function periods(from, to, interval = "month") {
  const f = parseDay(from);
  const e = parseDay(to);
  if (!f || !e || f > e) return [];
  const out = [];
  let cur;
  if (interval === "week") cur = new Date(f.getFullYear(), f.getMonth(), f.getDate() - ((f.getDay() + 6) % 7));
  else if (interval === "quarter") cur = new Date(f.getFullYear(), Math.floor(f.getMonth() / 3) * 3, 1);
  else cur = new Date(f.getFullYear(), f.getMonth(), 1);
  let guard = 0;
  while (cur <= e && guard++ < 400) {
    let next;
    if (interval === "week") next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    else if (interval === "quarter") next = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
    else next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const last = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
    out.push({ key: isoDay(cur), start: isoDay(cur < f ? f : cur), end: isoDay(last > e ? e : last) });
    cur = next;
  }
  return out;
}

/** Index of the period containing day d (binary search over sorted periods), or -1. */
function periodIndex(list, d) {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (d < list[mid].start) hi = mid - 1;
    else if (d > list[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Merchant label: explicit merchant, else the description. */
export function merchantOf(t) {
  return String(t?.merchant || t?.description || "Unknown").trim() || "Unknown";
}

/**
 * What kind of money a transaction is for reports:
 *   "transfer" — one leg of an own-account move (relationship_type set) or a
 *                Transfers / Credit Card Payments row;
 *   "income"   — money in that is real income (spending-overview isIncome);
 *   "expense"  — a debit that counts as spending under the user's settings;
 *   null       — anything else (e.g. a debit in an excluded group).
 */
export function kindOf(t, excluded) {
  if (t?.relationship_type || MOVEMENT_GROUPS.includes(groupOf(t))) return "transfer";
  if (isIncome(t)) return "income";
  if (countsAsSpend(t, excluded)) return "expense";
  return null;
}

/** Default (empty) filters. */
export function emptyFilters() {
  return { groups: [], merchant: "" };
}

/** Number of active filters (drives the badge on the filter button). */
export function activeFilterCount(filters) {
  if (!filters) return 0;
  return (Array.isArray(filters.groups) && filters.groups.length ? 1 : 0)
    + (typeof filters.merchant === "string" && filters.merchant.trim() ? 1 : 0);
}

/** Keep transactions inside [from, to] that pass the category / merchant filters. */
export function applyFilters(txns, filters, from, to) {
  const groups = Array.isArray(filters?.groups) && filters.groups.length ? new Set(filters.groups) : null;
  const needle = typeof filters?.merchant === "string" ? filters.merchant.trim().toLowerCase() : "";
  return (txns || []).filter((t) => {
    const d = txnDay(t);
    if (!d || (from && d < from) || (to && d > to)) return false;
    if (groups && !groups.has(groupOf(t))) return false;
    if (needle && !merchantOf(t).toLowerCase().includes(needle)) return false;
    return true;
  });
}

/**
 * Income / expenses / net per period (cash-flow tab).
 * Returns rows { key, start, end, income, expenses, net } oldest first.
 */
export function cashFlowByPeriod(txns, from, to, interval, excluded) {
  const list = periods(from, to, interval);
  const acc = list.map(() => ({ inC: 0, outC: 0 }));
  for (const t of txns || []) {
    const d = txnDay(t);
    if (!d) continue;
    const i = periodIndex(list, d);
    if (i < 0) continue;
    const k = kindOf(t, excluded);
    if (k === "income") acc[i].inC += cents(t.amount);
    else if (k === "expense") acc[i].outC += -cents(t.amount);
  }
  return list.map((p, i) => ({
    ...p, income: acc[i].inC / 100, expenses: acc[i].outC / 100, net: (acc[i].inC - acc[i].outC) / 100,
  }));
}

/** Totals strip for cashFlowByPeriod(): income, expenses, net, average net per period. */
export function cashFlowTotals(rows) {
  const list = rows || [];
  const inC = list.reduce((a, r) => a + cents(r.income), 0);
  const outC = list.reduce((a, r) => a + cents(r.expenses), 0);
  return {
    income: inC / 100,
    expenses: outC / 100,
    net: (inC - outC) / 100,
    avgPerPeriod: list.length ? round2((inC - outC) / 100 / list.length) : 0,
  };
}

/** Label used to group a row of the given kind by category or merchant. */
function labelFor(t, kind, by) {
  if (by === "merchant") return merchantOf(t);
  if (kind === "income") return groupOf(t) === "Income" ? (t.category || "Income") : "Other income";
  return groupOf(t);
}

/** Positive amount (cents) a transaction contributes to a kind's totals. */
function kindCents(t, kind) {
  const c = cents(t.amount);
  if (kind === "expense") return -c;
  if (kind === "income") return c;
  return Math.abs(c); // transfers: money moved, either direction
}

/**
 * Breakdown of one kind over the whole range (donut + table).
 * Returns { total, rows: [{ label, group, amount, pct, count }] } sorted by
 * amount desc; `top` caps the list, folding the tail into "Everything else".
 * `group` is the category group (for icons) when grouping by category.
 */
export function breakdown(txns, kind, by = "category", excluded, top = 0) {
  const map = new Map();
  for (const t of txns || []) {
    if (kindOf(t, excluded) !== kind) continue;
    const label = labelFor(t, kind, by);
    const cur = map.get(label) || { c: 0, count: 0, group: groupOf(t) };
    cur.c += kindCents(t, kind);
    cur.count += 1;
    map.set(label, cur);
  }
  let entries = [...map.entries()].sort((a, b) => b[1].c - a[1].c || a[0].localeCompare(b[0]));
  if (top > 0 && entries.length > top) {
    const tail = entries.slice(top);
    entries = entries.slice(0, top);
    entries.push(["Everything else", {
      c: tail.reduce((a, [, v]) => a + v.c, 0),
      count: tail.reduce((a, [, v]) => a + v.count, 0),
      group: "Other",
    }]);
  }
  const totalC = entries.reduce((a, [, v]) => a + v.c, 0);
  return {
    total: totalC / 100,
    rows: entries.map(([label, v]) => ({
      label, group: by === "merchant" ? null : v.group, amount: v.c / 100, count: v.count,
      pct: totalC ? round2((v.c / totalC) * 100) : 0,
    })),
  };
}

/**
 * Stacked totals of one kind per period (expenses / income / transfers bars).
 * Segment labels are the range's top `top` labels (plus "Everything else"),
 * in the same order for every period so the stacks line up.
 * Returns { labels, rows: [{ key, start, end, total, segments: number[] }] }.
 */
export function stackedByPeriod(txns, kind, from, to, interval, by = "category", excluded, top = 5) {
  const head = breakdown(txns, kind, by, excluded, top).rows.map((r) => r.label);
  const known = new Set(head.filter((l) => l !== "Everything else"));
  const rest = head.includes("Everything else") ? head.indexOf("Everything else") : -1;
  const list = periods(from, to, interval);
  const acc = list.map(() => head.map(() => 0));
  for (const t of txns || []) {
    if (kindOf(t, excluded) !== kind) continue;
    const d = txnDay(t);
    if (!d) continue;
    const i = periodIndex(list, d);
    if (i < 0) continue;
    const label = labelFor(t, kind, by);
    const j = known.has(label) ? head.indexOf(label) : rest;
    if (j < 0) continue;
    acc[i][j] += kindCents(t, kind);
  }
  return {
    labels: head,
    rows: list.map((p, i) => ({
      ...p,
      total: acc[i].reduce((a, c) => a + c, 0) / 100,
      segments: acc[i].map((c) => c / 100),
    })),
  };
}

/** Transfers in / out per period (transfers tab, split bars). */
export function transfersByPeriod(txns, from, to, interval) {
  const list = periods(from, to, interval);
  const acc = list.map(() => ({ inC: 0, outC: 0 }));
  for (const t of txns || []) {
    if (kindOf(t, []) !== "transfer") continue;
    const d = txnDay(t);
    if (!d) continue;
    const i = periodIndex(list, d);
    if (i < 0) continue;
    const c = cents(t.amount);
    if (c >= 0) acc[i].inC += c; else acc[i].outC += -c;
  }
  return list.map((p, i) => ({ ...p, moneyIn: acc[i].inC / 100, moneyOut: acc[i].outC / 100, total: (acc[i].inC + acc[i].outC) / 100 }));
}

/**
 * Change of each period's total vs the period before, in percent (null for the
 * first period or when the previous total was 0). Input: numbers oldest first.
 */
export function periodChanges(totals) {
  return (totals || []).map((v, i) => {
    if (i === 0) return null;
    const prev = num(totals[i - 1]);
    if (!prev) return null;
    return round2(((num(v) - prev) / Math.abs(prev)) * 100);
  });
}

/** Total and average per period of a list of period totals. */
export function totalsOf(values) {
  const list = values || [];
  const c = list.reduce((a, v) => a + cents(v), 0);
  return { total: c / 100, avgPerPeriod: list.length ? round2(c / 100 / list.length) : 0 };
}

const TAB_TITLES = { cashflow: "Cash flow", expenses: "Expenses", income: "Income", transfers: "Transfers" };

/** Suggested name for a saved view, e.g. "Expenses (Shopping, Food & Dining)". */
export function suggestViewName(config) {
  const title = TAB_TITLES[config?.tab] || "Report";
  const parts = [];
  const groups = Array.isArray(config?.filters?.groups) ? config.filters.groups : [];
  if (groups.length) parts.push(groups.length > 3 ? `${groups.slice(0, 3).join(", ")} +${groups.length - 3}` : groups.join(", "));
  const merchant = typeof config?.filters?.merchant === "string" ? config.filters.merchant.trim() : "";
  if (merchant) parts.push(`“${merchant}”`);
  if (!parts.length && config?.range?.preset && config.range.preset !== "custom") parts.push(presetLabel(config.range.preset));
  const name = parts.length ? `${title} (${parts.join(", ")})` : title;
  return name.length > 80 ? `${name.slice(0, 79)}…` : name;
}

/** Stable comparison of two report configs (key order independent). */
export function sameConfig(a, b) {
  const norm = (c) => JSON.stringify({
    tab: c?.tab, chart: c?.chart, interval: c?.interval, viewBy: c?.viewBy,
    range: { preset: c?.range?.preset, from: c?.range?.preset === "custom" ? c?.range?.from : undefined, to: c?.range?.preset === "custom" ? c?.range?.to : undefined },
    groups: [...(c?.filters?.groups || [])].sort(), merchant: (c?.filters?.merchant || "").trim().toLowerCase(),
  });
  return norm(a) === norm(b);
}
