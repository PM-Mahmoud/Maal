// shared/transactions-list.mjs — pure logic behind the Transactions list page
// (/app/transactions, redesign session 2 "Spending", HEL-91..95): search,
// filters, sorting, the summary strip, CSV export, CSV import parsing and the
// manual "Add transaction" payload. No I/O, no DOM; the React page imports
// these and test/transactions-list.test.js covers them (CLAUDE.md: money and
// filter logic must have a deterministic test).
//
// Rows use the GET /api/v1/reports/transactions shape (same row fields as
// GET /api/v1/transactions, but date-ranged and not cut at 500 rows): signed
// `amount` (negative = money out; NUMERIC may arrive as a string), `post_date`,
// `description`,
// `category_group` / `category`, optional `account_reference` and, when the
// Transaction detail part has added them, optional `hidden` / `reviewed`
// flags. Those flags are read defensively: absent means "not hidden" and
// "not reviewed", and the matching filters only appear when the data has them.

const pad2 = (n) => String(n).padStart(2, "0");

/** Signed amount as a finite number (strings like "-12.50" or "$1,200" accepted). */
export function amountOf(t) {
  const v = t?.amount;
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Whole cents, so sums never drift (0.1 + 0.2 problems). */
const toCents = (n) => Math.round(n * 100);

/** "YYYY-MM-DD" for a local Date. */
export function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The transaction's calendar day as "YYYY-MM-DD", or null. */
export function dayOf(t) {
  const raw = t && (t.post_date || t.occurred_on || t.date);
  if (!raw) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Category group with an "Other" fallback (the 18-group AU taxonomy). */
export function groupOf(t) {
  return (t && t.category_group) || "Other";
}

/** Stable key for the account a row came from; manual entries have none. */
export function accountKey(t) {
  const ref = t && t.account_reference ? String(t.account_reference).trim() : "";
  return ref || "manual";
}

/** Hidden from spending (set by the Transaction detail part, if present). */
export function isHidden(t) {
  if (!t) return false;
  return t.hidden === true || t.is_hidden === true || t.hidden === "true";
}

/** Marked as reviewed (set by the Transaction detail part, if present). */
export function isReviewed(t) {
  if (!t) return false;
  return t.reviewed === true || t.is_reviewed === true || t.reviewed === "true" || Boolean(t.reviewed_at);
}

/** Which optional detail flags exist anywhere in the data (drives the filter menu). */
export function detailFlags(rows) {
  let hidden = false;
  let reviewed = false;
  for (const t of rows || []) {
    if (!t) continue;
    if ("hidden" in t || "is_hidden" in t) hidden = true;
    if ("reviewed" in t || "is_reviewed" in t || "reviewed_at" in t) reviewed = true;
    if (hidden && reviewed) break;
  }
  return { hidden, reviewed };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** @typedef {{ query: string, from: string|null, to: string|null, accounts: string[], groups: string[], min: number|null, max: number|null, type: "all"|"expense"|"income", visibility: "all"|"visible"|"hidden", review: "all"|"reviewed"|"unreviewed" }} TxnFilters */

/** @returns {TxnFilters} */
export function emptyFilters() {
  return {
    query: "", from: null, to: null, accounts: [], groups: [],
    min: null, max: null, type: "all", visibility: "all", review: "all",
  };
}

/** How many filters (not counting the search box) are switched on. */
export function activeFilterCount(f) {
  if (!f) return 0;
  let n = 0;
  if (f.from || f.to) n++;
  if (f.accounts?.length) n++;
  if (f.groups?.length) n++;
  if (f.min != null || f.max != null) n++;
  if (f.type && f.type !== "all") n++;
  if (f.visibility && f.visibility !== "all") n++;
  if (f.review && f.review !== "all") n++;
  return n;
}

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Does the row match a free-text search? Every word must appear somewhere in
 * the description, merchant, category, category group or note. A query that
 * looks like money ("18.99", "$1,950") also matches the absolute amount.
 */
export function matchesSearch(t, query) {
  const q = norm(query);
  if (!q) return true;
  const hay = norm([t?.description, t?.merchant, t?.category, t?.category_group, t?.note, t?.notes].filter(Boolean).join(" "));
  const money = q.replace(/[$,\s]/g, "");
  if (/^-?\d+(\.\d{1,2})?$/.test(money)) {
    const want = Math.abs(Number(money));
    const have = Math.abs(amountOf(t));
    if (money.includes(".") ? toCents(have) === toCents(want) : Math.trunc(have) === want) return true;
  }
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** Apply search + every filter. Never invents rows; the output is a subset of the input. */
export function filterTransactions(rows, f) {
  const filters = { ...emptyFilters(), ...(f || {}) };
  const accounts = new Set(filters.accounts || []);
  const groups = new Set(filters.groups || []);
  const min = filters.min != null && Number.isFinite(Number(filters.min)) ? toCents(Number(filters.min)) : null;
  const max = filters.max != null && Number.isFinite(Number(filters.max)) ? toCents(Number(filters.max)) : null;
  return (rows || []).filter((t) => {
    if (!t) return false;
    const amt = amountOf(t);
    if (filters.type === "expense" && !(amt < 0)) return false;
    if (filters.type === "income" && !(amt > 0)) return false;
    if (filters.from || filters.to) {
      const d = dayOf(t);
      if (!d) return false;
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
    }
    if (accounts.size && !accounts.has(accountKey(t))) return false;
    if (groups.size && !groups.has(groupOf(t))) return false;
    if (min != null || max != null) {
      const abs = Math.abs(toCents(amt));
      if (min != null && abs < min) return false;
      if (max != null && abs > max) return false;
    }
    if (filters.visibility === "hidden" && !isHidden(t)) return false;
    if (filters.visibility === "visible" && isHidden(t)) return false;
    if (filters.review === "reviewed" && !isReviewed(t)) return false;
    if (filters.review === "unreviewed" && isReviewed(t)) return false;
    return matchesSearch(t, filters.query);
  });
}

/** Sort a copy. key: date | amount | category | merchant. Ties fall back to newest first. */
export function sortTransactions(rows, key = "date", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const byDate = (a, b) => String(dayOf(a) || "").localeCompare(String(dayOf(b) || ""));
  const cmp = {
    date: byDate,
    amount: (a, b) => amountOf(a) - amountOf(b),
    category: (a, b) => groupOf(a).localeCompare(groupOf(b)) || String(a.category || "").localeCompare(String(b.category || "")),
    merchant: (a, b) => norm(a.merchant || a.description).localeCompare(norm(b.merchant || b.description)),
  }[key] || byDate;
  return [...(rows || [])].sort((a, b) => sign * cmp(a, b) || -byDate(a, b));
}

/**
 * Summary strip for the rows on screen: count, first/last day and the money
 * in / money out totals (cent-exact). Empty input gives nulls for the range.
 */
export function summarise(rows) {
  let inC = 0;
  let outC = 0;
  let first = null;
  let last = null;
  for (const t of rows || []) {
    const c = toCents(amountOf(t));
    if (c > 0) inC += c;
    else outC += c;
    const d = dayOf(t);
    if (d) {
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
    }
  }
  return { count: (rows || []).length, from: first, to: last, moneyIn: inC / 100, moneyOut: outC / 100, net: (inC + outC) / 100 };
}

// ---------------------------------------------------------------------------
// Date presets (Australian financial year runs 1 July – 30 June)
// ---------------------------------------------------------------------------

/** Start year of the financial year containing `d` (FY2025-26 → 2025). */
export function fyStartYear(d) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Preset date ranges relative to `today`. Each is { id, label, from, to }. */
export function datePresets(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const t = isoDate(today);
  const daysAgo = (n) => isoDate(new Date(y, m, today.getDate() - n));
  const fy = fyStartYear(today);
  return [
    // The list loads at most 3 years at a time (GET /api/v1/reports/transactions),
    // so "no date filter" means the last 3 years and says so.
    { id: "all", label: "Last 3 years", from: null, to: null },
    { id: "this-month", label: "This month", from: isoDate(new Date(y, m, 1)), to: t },
    { id: "last-month", label: "Last month", from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) },
    { id: "30d", label: "Last 30 days", from: daysAgo(29), to: t },
    { id: "90d", label: "Last 90 days", from: daysAgo(89), to: t },
    { id: "this-fy", label: `This financial year (FY${String(fy + 1).slice(2)})`, from: `${fy}-07-01`, to: t },
    { id: "last-fy", label: `Last financial year (FY${String(fy).slice(2)})`, from: `${fy - 1}-07-01`, to: `${fy}-06-30` },
  ];
}

/** Which preset (if any) a from/to pair equals; "custom" otherwise. */
export function presetFor(from, to, today = new Date()) {
  const hit = datePresets(today).find((p) => p.from === (from || null) && p.to === (to || null));
  return hit ? hit.id : "custom";
}

// ---------------------------------------------------------------------------
// Fetch range (GET /api/v1/reports/transactions allows at most 3 years)
// ---------------------------------------------------------------------------

/** Longest range the reports endpoint accepts, inclusive (lib/report-views.js MAX_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 1096;

const dayNum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

/** "YYYY-MM-DD" shifted by n calendar days (UTC arithmetic, so no DST drift). */
export function addDays(day, n) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Validation message for a chosen date filter, or null when it can be fetched.
 * A missing end means today; a missing start is fine (the last 3 years up to the end).
 */
export function rangeError(from, to, today = new Date()) {
  if (!from) return null;
  const end = to || isoDate(today);
  if (from > end) return "The start date is after the end date.";
  if (dayNum(end) - dayNum(from) + 1 > MAX_RANGE_DAYS) return "Choose a range of up to 3 years.";
  return null;
}

/**
 * The { from, to } the list should request for the filters in force.
 * No date filter → the last 3 years ending today. A start without an end runs
 * to today; an end without a start covers the 3 years up to it. A range longer
 * than 3 years keeps its end and is cut to 3 years (`clamped: true`).
 * @returns {{ from: string, to: string, clamped: boolean }}
 */
export function fetchRange(filters, today = new Date()) {
  const f = filters || {};
  let to = f.to || isoDate(today);
  let from = f.from || null;
  if (from && from > to) [from, to] = [to, from];
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
  if (!from) return { from: earliest, to, clamped: false };
  if (from < earliest) return { from: earliest, to, clamped: true };
  return { from, to, clamped: false };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Quote one CSV cell. Text cells that start with = + - @ (or tab/CR) get a
 * leading apostrophe so a spreadsheet won't run them as a formula
 * (CSV injection). Numbers are written plain.
 */
export function csvCell(value, { text = true } = {}) {
  if (value == null) return "";
  let s = String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The export file for the given rows (already filtered to what the user sees,
 * and only ever their own rows from GET /api/v1/reports/transactions).
 * accountLabel(t) names the account; flags adds Hidden/Reviewed columns.
 */
export function transactionsToCsv(rows, { accountLabel = (t) => (accountKey(t) === "manual" ? "Manual entry" : accountKey(t)), flags = { hidden: false, reviewed: false } } = {}) {
  const head = ["Date", "Description", "Category group", "Category", "Account", "Type", "Amount (AUD)"];
  if (flags.hidden) head.push("Hidden");
  if (flags.reviewed) head.push("Reviewed");
  const lines = [head.join(",")];
  for (const t of rows || []) {
    const amt = amountOf(t);
    const cells = [
      csvCell(dayOf(t) || ""),
      csvCell(t.merchant || t.description || ""),
      csvCell(groupOf(t)),
      csvCell(t.category || ""),
      csvCell(accountLabel(t)),
      csvCell(amt < 0 ? "Money out" : "Money in"),
      csvCell((toCents(amt) / 100).toFixed(2), { text: false }),
    ];
    if (flags.hidden) cells.push(isHidden(t) ? "Yes" : "No");
    if (flags.reviewed) cells.push(isReviewed(t) ? "Yes" : "No");
    lines.push(cells.join(","));
  }
  // CRLF per RFC 4180; a BOM so Excel opens UTF-8 (é, —) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** "maal-transactions-2026-11-22.csv" (or with the filtered date range). */
export function exportFilename(filters, today = new Date()) {
  const f = filters || {};
  if (f.from || f.to) return `maal-transactions-${f.from || "start"}-to-${f.to || isoDate(today)}.csv`;
  return `maal-transactions-${isoDate(today)}.csv`;
}

// ---------------------------------------------------------------------------
// CSV import parsing (moved from the old page; behaviour unchanged)
// ---------------------------------------------------------------------------

/** Minimal RFC-4180 parser: quoted fields, "" escapes, embedded commas/newlines, CRLF or LF, BOM. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** YYYY-MM-DD or AU-style DD/MM/YYYY → normalised YYYY-MM-DD; impossible dates → null. */
export function parseDateCell(raw) {
  const s = String(raw ?? "").trim();
  let y = 0, m = 0, d = 0;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) { y = Number(match[1]); m = Number(match[2]); d = Number(match[3]); }
  else {
    match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Amount cell → signed number. "(12.34)", "-12.34" and "12.34 CR" are negative. Unreadable → null. */
export function parseAmountCell(raw) {
  const s = String(raw ?? "").trim();
  if (!/\d/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || /\bcr\b/i.test(s) || /^-/.test(s);
  const n = Number(s.replace(/[()]/g, "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/**
 * Parse a whole bank CSV (Date, Description, Amount) into rows ready for
 * POST /api/v1/transactions. All-or-nothing: the first bad row returns an
 * error naming the row, so a malformed file never half-imports.
 * @returns {{ rows: Array<{occurred_on: string, description: string, amount: number}> } | { error: string }}
 */
export function parseStatementCsv(text) {
  const rows = parseCsv(String(text ?? "")).filter((r) => r.some((c) => c.trim().length > 0));
  const headerCells = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const hasHeader = headerCells.some((c) => c.includes("date")) && headerCells.some((c) => c.includes("amount"));
  const body = hasHeader ? rows.slice(1) : rows;
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const cells = body[i];
    if (cells.length < 3) continue; // stray notes/summary lines in bank exports
    const rowNo = i + (hasHeader ? 2 : 1);
    const [rawDate, rawDesc, rawAmt] = cells.map((c) => c.trim());
    const d = parseDateCell(rawDate);
    if (!d) return { error: `Row ${rowNo}: couldn’t read the date ("${rawDate.slice(0, 24)}"). Use YYYY-MM-DD or DD/MM/YYYY. No transactions were imported.` };
    if (!rawDesc) return { error: `Row ${rowNo}: missing a description. No transactions were imported.` };
    const amount = parseAmountCell(rawAmt);
    if (amount === null) return { error: `Row ${rowNo}: couldn’t read the amount ("${rawAmt.slice(0, 24)}"). No transactions were imported.` };
    out.push({ occurred_on: d, description: rawDesc.slice(0, 160), amount });
  }
  if (!out.length) return { error: "No valid rows found. Expected columns: Date, Description, Amount." };
  return { rows: out };
}

/** Fingerprint used to skip rows already imported from this browser. */
export function rowFingerprint(r) {
  return `${r.occurred_on}|${String(r.description).trim().toLowerCase()}|${Number(r.amount).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Manual "Add transaction"
// ---------------------------------------------------------------------------

export const MAX_MANUAL_AMOUNT = 10_000_000;

/**
 * Validate the Add transaction form and build the POST body.
 * The user types a positive amount and picks Expense or Income; we sign it.
 * Dates may not be in the future (manual entries record money that moved).
 * @param {{ type: "expense"|"income", description: string, amount: string|number, date: string, group?: string, category?: string }} form
 * @returns {{ ok: true, body: { occurred_on: string, description: string, amount: number }, category: { group: string, category?: string } | null } | { ok: false, errors: Record<string, string> }}
 */
export function buildManualTransaction(form, today = new Date()) {
  const errors = {};
  const description = String(form?.description ?? "").trim().replace(/\s+/g, " ");
  if (!description) errors.description = "Add a description, like the merchant’s name.";
  else if (description.length > 160) errors.description = "Keep the description under 160 characters.";

  const rawAmt = String(form?.amount ?? "").replace(/[$,\s]/g, "");
  let cents = null;
  if (!rawAmt) errors.amount = "Enter an amount.";
  else if (!/^\d+(\.\d{1,2})?$/.test(rawAmt)) errors.amount = "Enter a positive amount with up to 2 decimal places.";
  else {
    cents = Math.round(Number(rawAmt) * 100);
    if (cents <= 0) errors.amount = "The amount must be more than $0.00.";
    else if (cents > MAX_MANUAL_AMOUNT * 100) errors.amount = "That amount is too large for a single transaction.";
  }

  const date = parseDateCell(form?.date ?? "");
  if (!date) errors.date = "Choose a valid date.";
  else if (date > isoDate(today)) errors.date = "The date can’t be in the future.";

  const type = form?.type === "income" ? "income" : "expense";
  if (Object.keys(errors).length) return { ok: false, errors };
  const amount = (type === "expense" ? -cents : cents) / 100;
  const group = form?.group ? String(form.group) : "";
  return {
    ok: true,
    body: { occurred_on: date, description, amount },
    category: group ? { group, ...(form.category ? { category: String(form.category) } : {}) } : null,
  };
}
