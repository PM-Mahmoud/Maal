/**
 * Home dashboard money math — shared pure functions.
 *
 * SINGLE SOURCE OF TRUTH for how the Home net-worth card turns the user's
 * account rows (cash_accounts, investments, super_accounts, properties, debts,
 * other_assets) and daily net-worth snapshots into:
 *   - the per-account list shown in "Filter accounts",
 *   - the headline total for the selected accounts,
 *   - the chart series for the selected accounts and range,
 *   - the change figure under the headline,
 *   - the month's spending calendar.
 *
 * Covered by test/home-accounts.test.js (deterministic, no DB). ESM (.mjs) so
 * Vite bundles it natively; the CommonJS test suite loads it with import().
 *
 * Postgres BIGINT columns arrive as strings, so every amount goes through
 * num() before arithmetic.
 */

const CATEGORIES = ["cash", "investments", "super", "other", "debts"];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emptyCategories() {
  return { cash: 0, investments: 0, super: 0, other: 0, debts: 0 };
}

/**
 * Normalise raw table rows into Home accounts. Each account carries the amount
 * it contributes to each snapshot category; `balance` is its net contribution
 * to net worth (debts negative, property = value - mortgage).
 *
 * @param {{cash?:object[], investments?:object[], super?:object[], properties?:object[], debts?:object[], other?:object[]}} rows
 */
export function buildHomeAccounts(rows = {}) {
  const out = [];
  const push = (row, id, kind, name, institution, categories, extra = {}) => {
    const c = { ...emptyCategories(), ...categories };
    const balance = c.cash + c.investments + c.super + c.other - c.debts;
    // Linked providers can replace row IDs on every sync. Use their stable
    // reference for history while retaining the UI's existing filter IDs.
    const reference = String(row.account_reference || "");
    const historyKey = /^(basiq|lunchflow):[A-Za-z0-9_-]+$/.test(reference) ? reference : id;
    out.push({ id, historyKey, kind, name, institution: institution || null, categories: c, balance, ...extra });
  };
  for (const r of rows.cash || []) {
    push(r, `cash:${r.id}`, "cash", r.label || "Bank account", r.institution || r.label, { cash: num(r.balance) }, {
      reference: r.account_reference ? String(r.account_reference).slice(-4) : null,
    });
  }
  for (const r of rows.investments || []) {
    push(r, `investment:${r.id}`, "investment", r.name || r.ticker || "Investment", r.platform || r.institution || r.name, { investments: num(r.value) });
  }
  for (const r of rows.super || []) {
    push(r, `super:${r.id}`, "super", r.fund_name || r.label || "Super account", r.fund_name || r.label, { super: num(r.balance) });
  }
  for (const r of rows.properties || []) {
    push(r, `property:${r.id}`, "property", r.label || "Property", null, { other: num(r.value), debts: num(r.mortgage_balance) });
  }
  for (const r of rows.debts || []) {
    push(r, `debt:${r.id}`, "debt", r.label || "Debt", r.lender || r.institution || r.label, { debts: num(r.balance) });
  }
  for (const r of rows.other || []) {
    push(r, `other:${r.id}`, "other", r.label || "Other asset", null, { other: num(r.value) });
  }
  return out;
}

/** null / undefined selection means "all accounts". Unknown ids are ignored. */
function isSelected(selectedIds, id) {
  if (!selectedIds) return true;
  return selectedIds.includes(id);
}

/** Category totals and net worth for the selected accounts. */
export function filteredTotals(accounts, selectedIds = null) {
  const t = emptyCategories();
  for (const a of accounts) {
    if (!isSelected(selectedIds, a.id)) continue;
    for (const k of CATEGORIES) t[k] += num(a.categories[k]);
  }
  return { ...t, netWorth: t.cash + t.investments + t.super + t.other - t.debts };
}

/** Canonical captured amount per account, in AUD cents before aggregation. */
export function accountSnapshotValues(accounts) {
  const netWorth = new Map();
  for (const account of accounts) {
    const key = account.historyKey;
    netWorth.set(key, (netWorth.get(key) || 0) + Math.round(num(account.balance) * 100));
  }
  return [...netWorth].map(([account_key, cents]) => ({ account_key, net_worth: cents / 100 }));
}

/** True when the selection is a strict subset of the accounts. */
export function isPartialSelection(accounts, selectedIds) {
  if (!selectedIds) return false;
  return accounts.some((a) => !selectedIds.includes(a.id));
}

/** The filtered chart starts with the first captured point for its selection. */
export function filteredSeries(snapshots, accounts, selectedIds = null, accountHistory = []) {
  if (isPartialSelection(accounts, selectedIds)) {
    return accountHistory.map((s) => ({ date: s.date, value: num(s.value) }));
  }
  return snapshots.map((s) => ({ date: s.date, value: num(s.netWorth) }));
}

/**
 * Unrealised gain on a holding: value - cost basis, and percent of cost.
 * pct is null without a positive cost basis (no made-up returns).
 */
export function holdingReturn(value, costBasis) {
  const v = num(value);
  const c = num(costBasis);
  if (c <= 0) return { gain: null, pct: null };
  const gain = Math.round((v - c) * 100) / 100;
  return { gain, pct: Math.round((gain / c) * 10000) / 100 };
}

export const RANGES = ["1W", "1M", "3M", "YTD", "ALL"];

/** Inclusive start date (YYYY-MM-DD) for a range, or null for ALL. */
export function rangeStart(range, now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  switch (range) {
    case "1W": d.setUTCDate(d.getUTCDate() - 7); break;
    case "1M": d.setUTCMonth(d.getUTCMonth() - 1); break;
    case "3M": d.setUTCMonth(d.getUTCMonth() - 3); break;
    case "YTD": return `${now.getFullYear()}-01-01`;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
}

/** Points on or after the range start. */
export function sliceSeries(series, range, now = new Date()) {
  const start = rangeStart(range, now);
  if (!start) return series.slice();
  return series.filter((p) => String(p.date).slice(0, 10) >= start);
}

/**
 * Change across a series: last minus first, and percent of |first|.
 * pct is null when there's nothing to compare (fewer than 2 points or a zero
 * opening value), so the UI never shows a made-up percentage.
 */
export function seriesChange(series) {
  if (!series || series.length < 2) return { change: 0, pct: null };
  const first = num(series[0].value);
  const last = num(series[series.length - 1].value);
  const change = Math.round((last - first) * 100) / 100;
  const pct = first !== 0 ? Math.round((change / Math.abs(first)) * 10000) / 100 : null;
  return { change, pct };
}

/**
 * Spending for one calendar month from signed transactions (negative = money
 * out). Transfers and income are excluded; refunds are not netted off.
 * Returns the total spent and an array of per-day totals (index 0 = day 1).
 * Days after `today` (in the current month) are null so the calendar can show
 * them as not-yet-happened.
 */
export function monthSpending(transactions, year, month /* 0-11 */, today = new Date()) {
  const days = new Date(year, month + 1, 0).getDate();
  const byDay = Array.from({ length: days }, () => 0);
  let total = 0;
  for (const t of transactions || []) {
    const raw = t.post_date || t.date || t.transaction_date;
    if (!raw) continue;
    const ds = String(raw).slice(0, 10);
    const [y, m, d] = ds.split("-").map(Number);
    if (y !== year || m !== month + 1 || !d) continue;
    const amt = num(t.amount);
    if (amt >= 0) continue;
    const cat = `${t.category_group || ""} ${t.category || ""} ${t.group || ""} ${t.relationship_type || ""}`.toLowerCase();
    if (cat.includes("transfer")) continue;
    byDay[d - 1] += -amt;
    total += -amt;
  }
  const isCurrent = today.getFullYear() === year && today.getMonth() === month;
  const result = byDay.map((v, i) => (isCurrent && i + 1 > today.getDate() ? null : Math.round(v * 100) / 100));
  return { total: Math.round(total * 100) / 100, byDay: result };
}
