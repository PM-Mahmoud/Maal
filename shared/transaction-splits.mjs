// shared/transaction-splits.mjs — pure money logic for Transaction detail
// (redesign session 2, HEL-100 hiding + HEL-101 splitting). No I/O, no DOM.
// Used by the React drawer (live validation), routes/api.js (server-side
// validation before anything is written) and covered by
// test/transaction-splits.test.js, per CLAUDE.md.
//
// All sums are done in integer cents so $71.95 split three ways never drifts.
//
// Split model: a transaction of signed `amount` (negative = money out) is split
// into 2–MAX_SPLITS parts. Each part has a POSITIVE `amount` (the magnitude),
// a `category_group` (+ optional `category`) and an optional `hidden` flag.
// The part magnitudes must add up to the transaction's magnitude exactly.

export const MAX_SPLITS = 20;
export const MIN_SPLITS = 2;

/** Parse a money value ("$1,234.50", 12.3, "12") to a finite number, or NaN. */
export function parseMoney(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s) && !/^-?\.\d+$/.test(s)) return NaN;
  return Number(s);
}

/** A money value in integer cents, or NaN (also NaN for more than 2 decimals). */
export function toCents(v) {
  const n = parseMoney(v);
  if (!Number.isFinite(n)) return NaN;
  const cents = Math.round(n * 100);
  // Reject sub-cent precision ("1.005") rather than silently rounding.
  if (Math.abs(cents - n * 100) > 1e-6) return NaN;
  return cents;
}

const fromCents = (c) => c / 100;

/** Divide `total` (magnitude) into n equal parts; leftover cents go to the first parts. */
export function equalSplit(total, n) {
  const cents = Math.abs(toCents(total));
  const count = Math.max(1, Math.floor(Number(n) || 0));
  if (!Number.isFinite(cents)) return [];
  const base = Math.floor(cents / count);
  const extra = cents - base * count;
  return Array.from({ length: count }, (_, i) => fromCents(base + (i < extra ? 1 : 0)));
}

/** Cents still to allocate: |total| minus the sum of valid part amounts (may be negative). */
export function remainingCents(total, parts) {
  const t = Math.abs(toCents(total));
  const used = (parts || []).reduce((a, p) => {
    const c = toCents(p && p.amount);
    return Number.isFinite(c) ? a + c : a;
  }, 0);
  return t - used;
}

/**
 * Validate a proposed split of a transaction whose signed amount is `total`.
 * Returns { ok, error, partErrors, parts } where `parts` is the normalised list
 * (amount rounded to 2dp, trimmed strings, boolean hidden) when ok.
 */
export function validateSplits(total, parts) {
  const partErrors = [];
  const totalCents = Math.abs(toCents(total));
  if (!Number.isFinite(totalCents) || totalCents === 0) {
    return { ok: false, error: "This transaction has no amount to split.", partErrors, parts: [] };
  }
  if (!Array.isArray(parts) || parts.length < MIN_SPLITS) {
    return { ok: false, error: `A split needs at least ${MIN_SPLITS} parts.`, partErrors, parts: [] };
  }
  if (parts.length > MAX_SPLITS) {
    return { ok: false, error: `A split can have at most ${MAX_SPLITS} parts.`, partErrors, parts: [] };
  }
  const out = [];
  let sum = 0;
  parts.forEach((p, i) => {
    const cents = toCents(p && p.amount);
    const group = typeof p?.category_group === "string" ? p.category_group.trim() : "";
    if (!Number.isFinite(cents) || cents <= 0) partErrors[i] = "Amount must be a valid number above $0.";
    else if (!group) partErrors[i] = "Choose a category.";
    if (Number.isFinite(cents)) sum += cents;
    const category = typeof p?.category === "string" && p.category.trim() ? p.category.trim() : null;
    out.push({ amount: Number.isFinite(cents) ? fromCents(cents) : NaN, category_group: group, category, hidden: !!(p && p.hidden) });
  });
  if (partErrors.some(Boolean)) return { ok: false, error: "Fix the highlighted parts.", partErrors, parts: [] };
  if (sum !== totalCents) {
    const diff = fromCents(totalCents - sum);
    const msg = diff > 0
      ? `The parts are $${diff.toFixed(2)} short of the total.`
      : `The parts are $${Math.abs(diff).toFixed(2)} over the total.`;
    return { ok: false, error: msg, partErrors, parts: [] };
  }
  return { ok: true, error: null, partErrors, parts: out };
}

/**
 * The rows that should feed spending totals, from GET /api/v1/transactions
 * rows (with the additive `hidden` and `splits` fields):
 *   - hidden transactions are dropped;
 *   - a split transaction is replaced by one virtual row per part (same date,
 *     merchant and sign as the original, the part's category), hidden parts
 *     dropped. Virtual rows carry `split_of` = the original id.
 * Rows without those fields pass through untouched, so this is safe to apply
 * before any existing maths (e.g. shared/spending-overview.mjs).
 */
export function effectiveTransactions(rows) {
  const out = [];
  for (const t of rows || []) {
    if (!t || t.hidden) continue;
    const splits = Array.isArray(t.splits) ? t.splits : [];
    if (splits.length < MIN_SPLITS) { out.push(t); continue; }
    const sign = parseMoney(t.amount) < 0 ? -1 : 1;
    splits.forEach((s, i) => {
      if (s.hidden) return;
      const cents = toCents(s.amount);
      if (!Number.isFinite(cents)) return;
      out.push({
        ...t,
        id: `${t.id}:s${i + 1}`,
        split_of: t.id,
        amount: sign * Math.abs(fromCents(cents)),
        category_group: s.category_group,
        category: s.category || null,
        splits: undefined,
      });
    });
  }
  return out;
}
