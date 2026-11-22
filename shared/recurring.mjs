// shared/recurring.mjs — pure maths for the Spending › Recurring page
// (redesign session 2, HEL-104/105). Used by the server (routes/api.js merges
// manual items into GET /v1/transactions/recurring) and the React client
// (calendar, list, totals). No DB, no network, no Date.now() unless a caller
// omits `today`. Tested in test/recurring-items.test.js.
//
// Dates are local calendar days as "YYYY-MM-DD". Amounts are positive AUD
// (the expected size); `kind` says which way the money goes.

export const FREQUENCIES = ["weekly", "fortnightly", "monthly", "yearly"];
export const KINDS = ["bill", "subscription", "income"];
export const FREQUENCY_LABELS = { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", yearly: "Yearly" };
export const KIND_LABELS = { bill: "Bill", subscription: "Subscription", income: "Income" };

const MAX_AMOUNT = 10_000_000;
const NAME_MAX = 80;

const pad = (n) => String(n).padStart(2, "0");
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Local Date → "YYYY-MM-DD". */
export function isoDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" (or an ISO timestamp) → local Date at midnight, or null. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

/** Same day-of-month `months` later, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
function addMonthsClamped(d, months, anchorDay) {
  const day = anchorDay || d.getDate();
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last));
}

/** The occurrence after `d` for a cadence. `anchorDay` keeps 31st-of-month bills on the 31st when possible. */
export function stepDate(d, cadence, anchorDay) {
  switch (cadence) {
    case "weekly": return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    case "fortnightly": return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14);
    case "monthly": return addMonthsClamped(d, 1, anchorDay);
    case "yearly": return addMonthsClamped(d, 12, anchorDay);
    default: return null;
  }
}

/** Every occurrence date ("YYYY-MM-DD") of a schedule between from..to inclusive. */
export function occurrencesBetween(startDay, cadence, from, to, max = 400) {
  let d = parseDay(startDay);
  const start = parseDay(from);
  const end = parseDay(to);
  if (!d || !start || !end || !FREQUENCIES.includes(cadence)) return [];
  const anchor = d.getDate();
  const out = [];
  for (let guard = 0; d && d <= end && guard < 5000 && out.length < max; guard++) {
    if (d >= start) out.push(isoDay(d));
    d = stepDate(d, cadence, anchor);
  }
  return out;
}

/** First occurrence on or after `today` (rolls a stale next date forward). */
export function rollForward(startDay, cadence, today = new Date()) {
  let d = parseDay(startDay);
  if (!d || !FREQUENCIES.includes(cadence)) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const anchor = d.getDate();
  for (let guard = 0; d < t && guard < 5000; guard++) d = stepDate(d, cadence, anchor);
  return isoDay(d);
}

/** Average monthly cost of a schedule (weekly × 52 / 12, etc.). */
export function monthlyEquivalent(amount, cadence) {
  const a = Math.abs(Number(amount) || 0);
  const perYear = { weekly: 52, fortnightly: 26, monthly: 12, yearly: 1 }[cadence];
  return perYear ? round2((a * perYear) / 12) : 0;
}

/**
 * Monthly totals across items: { bills, subscriptions, income, outgoing, net }.
 * Each value is the average-month equivalent, not a calendar-month sum.
 */
export function monthlyTotals(items) {
  const t = { bills: 0, subscriptions: 0, income: 0 };
  for (const it of items || []) {
    const m = monthlyEquivalent(it.averageAmount ?? it.amount, it.cadence);
    if (it.kind === "income") t.income += m;
    else if (it.kind === "subscription") t.subscriptions += m;
    else t.bills += m;
  }
  const bills = round2(t.bills);
  const subscriptions = round2(t.subscriptions);
  const income = round2(t.income);
  return { bills, subscriptions, income, outgoing: round2(bills + subscriptions), net: round2(income - bills - subscriptions) };
}

/** Sunday-first two-week window, `offset` fortnights from the one holding `today`. */
export function fortnightWindow(today = new Date(), offset = 0) {
  const sun = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + offset * 14);
  return Array.from({ length: 14 }, (_, i) => new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i));
}

/** Fortnight offset (from today's window) of the window containing `day`. */
export function offsetForDay(day, today = new Date()) {
  const d = parseDay(day);
  if (!d) return 0;
  const sun = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const diff = Math.round((d - sun) / 86400000);
  return Math.floor(diff / 14);
}

/**
 * Project merged recurring items onto from..to. Returns
 * [{ date, id, merchant, amount, kind, cadence, source }] sorted by date,
 * outgoing before income on the same day, bigger first.
 */
export function projectItems(items, from, to) {
  const out = [];
  for (const it of items || []) {
    const amount = round2(Math.abs(Number(it.averageAmount ?? it.amount) || 0));
    for (const date of occurrencesBetween(it.nextEstimate, it.cadence, from, to, 60)) {
      out.push({ date, id: it.id, merchant: it.merchant || "Recurring payment", amount, kind: it.kind || "bill", cadence: it.cadence, source: it.source || "detected" });
    }
  }
  const rank = (k) => (k === "income" ? 1 : 0);
  return out.sort((a, b) => a.date.localeCompare(b.date) || rank(a.kind) - rank(b.kind) || b.amount - a.amount);
}

/** Window summary: counts + totals per kind for projected occurrences. */
export function summarise(occurrences) {
  const s = { bills: { count: 0, total: 0 }, subscriptions: { count: 0, total: 0 }, income: { count: 0, total: 0 } };
  for (const o of occurrences || []) {
    const k = o.kind === "income" ? "income" : o.kind === "subscription" ? "subscriptions" : "bills";
    s[k].count += 1;
    s[k].total = round2(s[k].total + o.amount);
  }
  return { ...s, outgoing: round2(s.bills.total + s.subscriptions.total) };
}

/** First projected occurrence on/after `today` across all items, or null. */
export function nextOccurrence(items, today = new Date()) {
  let best = null;
  for (const it of items || []) {
    const d = rollForward(it.nextEstimate, it.cadence, today);
    if (d && (!best || d < best.date)) best = { date: d, merchant: it.merchant, kind: it.kind };
  }
  return best;
}

/**
 * Validate a manual recurring item from a request body. Returns
 * { item } (normalised) or { error } (user-facing message).
 * Amount must be > 0; kind carries the direction.
 */
export function validateRecurringInput(body, { partial = false } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const item = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) return { error: "Give this recurring item a name." };
    if (name.length > NAME_MAX) return { error: `Keep the name under ${NAME_MAX} characters.` };
    item.name = name;
  }
  if (!partial || b.amount !== undefined) {
    const raw = typeof b.amount === "string" ? b.amount.replace(/[$,\s]/g, "") : b.amount;
    const amount = Number(raw);
    if (raw === "" || raw === null || !Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above $0." };
    if (amount > MAX_AMOUNT) return { error: "That amount looks too large." };
    item.amount = round2(amount);
  }
  if (!partial || b.frequency !== undefined) {
    if (!FREQUENCIES.includes(b.frequency)) return { error: "Choose how often this happens." };
    item.frequency = b.frequency;
  }
  if (!partial || b.kind !== undefined) {
    if (!KINDS.includes(b.kind)) return { error: "Choose bill, subscription or income." };
    item.kind = b.kind;
  }
  if (!partial || b.next_date !== undefined) {
    const d = parseDay(b.next_date);
    if (!d) return { error: "Choose the next payment date." };
    item.next_date = isoDay(d);
  }
  if (b.category_group !== undefined) item.category_group = b.category_group ? String(b.category_group).slice(0, 60) : null;
  if (b.source_key !== undefined) item.source_key = b.source_key ? String(b.source_key).slice(0, 80) : null;
  if (b.transaction_id !== undefined) item.transaction_id = b.transaction_id == null || b.transaction_id === "" ? null : String(b.transaction_id).slice(0, 40);
  if (partial && Object.keys(item).length === 0) return { error: "Nothing to update." };
  return { item };
}

/** A recurring_items DB row → the GET /v1/transactions/recurring item shape. */
export function manualToRecurring(row, today = new Date()) {
  const amount = round2(Math.abs(Number(row.amount) || 0));
  const next = row.next_date instanceof Date ? isoDay(row.next_date) : String(row.next_date || "").slice(0, 10);
  return {
    id: `manual:${row.id}`,
    kind: row.kind,
    merchant: row.name,
    merchant_key: row.source_key || null,
    averageAmount: amount,
    minAmount: amount,
    maxAmount: amount,
    cadence: row.frequency,
    confidence: 1,
    occurrences: null,
    lastDate: null,
    nextEstimate: rollForward(next, row.frequency, today) || next,
    category_group: row.category_group || null,
    source: "manual",
  };
}

/**
 * Merge auto-detected recurring rows with the user's manual items and
 * decisions. `rows` are recurring_items DB rows with status:
 *   active    — a manual item (shown; if source_key matches a detected
 *               merchant_key it replaces that detected row — an edit)
 *   dismissed — hides the detected row with that source_key
 *   confirmed — marks the detected row with that source_key confirmed
 * Detected rows keep their original fields and gain id, source, confirmed.
 * Output: manual + detected, sorted by next date then name.
 */
export function mergeRecurring(detected, rows, today = new Date()) {
  const dismissed = new Set();
  const confirmed = new Set();
  const replaced = new Set();
  const manual = [];
  for (const r of rows || []) {
    const key = r.source_key || null;
    if (r.status === "dismissed") { if (key) dismissed.add(key); continue; }
    if (r.status === "confirmed") { if (key) confirmed.add(key); continue; }
    if (key) replaced.add(key);
    manual.push(manualToRecurring(r, today));
  }
  const auto = [];
  for (const d of detected || []) {
    const key = d.merchant_key || null;
    if (key && (dismissed.has(key) || replaced.has(key))) continue;
    auto.push({ ...d, id: `detected:${key || d.merchant}`, source: "detected", confirmed: Boolean(key && confirmed.has(key)) });
  }
  const sortKey = (it) => rollForward(it.nextEstimate, it.cadence, today) || "9999-12-31";
  return [...manual, ...auto].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || String(a.merchant).localeCompare(String(b.merchant)));
}

/** Suggest a kind for a picked transaction: credit → income, else subscription if it looks like one, else bill. */
export function suggestKind(txn) {
  const amt = Number(txn?.amount) || 0;
  if (amt > 0) return "income";
  const text = `${txn?.description || ""} ${txn?.merchant || ""}`.toLowerCase();
  if (txn?.category_group === "Recurring & Subscriptions"
    || /\b(netflix|spotify|stan|binge|kayo|disney|youtube|apple|icloud|adobe|microsoft|subscription|membership|streaming|audible|amazon prime|chatgpt|openai)\b/.test(text)) return "subscription";
  return "bill";
}

/**
 * Credit card repayments seen in transactions (category group "Credit Card
 * Payments"), one row per card/payee: { key, name, institution, lastAmount,
 * lastDate, count }. Only payments within `days` of `today`; newest first.
 * Shows what was actually paid — never a guessed statement balance.
 */
export function creditCardPayments(txns, today = new Date(), days = 120) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  const map = new Map();
  for (const t of txns || []) {
    if ((t.category_group || "") !== "Credit Card Payments") continue;
    const d = parseDay(t.post_date);
    if (!d || d < t0 || d > today) continue;
    const name = String(t.merchant || t.description || "Card payment").trim();
    const key = String(t.institution || name).toLowerCase();
    const amount = round2(Math.abs(Number(t.amount) || 0));
    const day = isoDay(d);
    const cur = map.get(key);
    if (!cur) map.set(key, { key, name, institution: t.institution || null, lastAmount: amount, lastDate: day, count: 1 });
    else {
      cur.count += 1;
      if (day > cur.lastDate) Object.assign(cur, { name, lastAmount: amount, lastDate: day });
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/** Next date for a picked transaction: its date stepped forward by the cadence until on/after today. */
export function suggestNextDate(txnDay, cadence, today = new Date()) {
  const d = parseDay(txnDay);
  if (!d) return isoDay(today);
  const anchor = d.getDate();
  const next = stepDate(d, cadence, anchor);
  return rollForward(isoDay(next), cadence, today);
}
