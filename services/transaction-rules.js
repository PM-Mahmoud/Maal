'use strict';
// services/transaction-rules.js
// Pure logic for the transaction rules engine + subscriptions detection
// (specs/silvia-parity-tier1-2.md, PR 6). Kept side-effect-free so it can be
// unit-tested deterministically; the DB wiring lives in routes/api.js.

// Does a rule match a transaction? Case-insensitive on the description.
// match_type: 'contains' (default) | 'equals' | 'starts_with'.
function matchRule(rule, txn) {
  const text = String((txn && txn.description) || '').toLowerCase();
  const needle = String((rule && rule.match_text) || '').toLowerCase();
  if (!needle) return false;
  switch (rule.match_type) {
    case 'equals': return text === needle;
    case 'starts_with': return text.startsWith(needle);
    case 'contains':
    default: return text.includes(needle);
  }
}

// Compute category assignments for transactions from a rule set. First matching
// rule wins (rules earlier in the array take precedence). Returns
// [{ transaction_id, category_group, category }]. Pure — no DB.
function computeAssignments(rules, txns) {
  const out = [];
  for (const txn of txns || []) {
    for (const rule of rules || []) {
      if (matchRule(rule, txn)) {
        out.push({ transaction_id: txn.id, category_group: rule.category_group, category: rule.category || null });
        break;
      }
    }
  }
  return out;
}

// Detect recurring subscriptions from a transaction history. A subscription is a
// set of same-merchant, similar-amount debits recurring on a roughly regular
// cadence (weekly / fortnightly / monthly / yearly). Pure — no DB.
//
// Grouping key = normalised description + rounded amount, so "NETFLIX.COM
// SYDNEY" and "NETFLIX.COM" with the same charge group together.
function detectSubscriptions(txns, opts) {
  const options = opts || {};
  const minOccurrences = options.minOccurrences || 3;
  const groups = new Map();

  for (const t of txns || []) {
    const amount = Number(t.amount) || 0;
    if (amount >= 0) continue; // subscriptions are debits (money out)
    const key = normaliseMerchant(t.description) + '|' + Math.round(Math.abs(amount));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ date: t.post_date, amount: Math.abs(amount), description: t.description });
  }

  const subs = [];
  for (const items of groups.values()) {
    if (items.length < minOccurrences) continue;
    const dated = items.filter((i) => i.date).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (dated.length < minOccurrences) continue;
    const cadence = inferCadence(dated.map((d) => new Date(d.date)));
    if (!cadence) continue; // irregular → not a subscription
    const last = dated[dated.length - 1];
    subs.push({
      merchant: cleanMerchantLabel(last.description),
      amount: last.amount,
      cadence,
      occurrences: dated.length,
      lastDate: toISO(last.date),
      nextEstimate: toISO(addDays(new Date(last.date), CADENCE_DAYS[cadence])),
    });
  }
  // Largest annualised spend first.
  subs.sort((a, b) => annualised(b) - annualised(a));
  return subs;
}

const CADENCE_DAYS = { weekly: 7, fortnightly: 14, monthly: 30, yearly: 365 };

function annualised(sub) {
  return sub.amount * (365 / CADENCE_DAYS[sub.cadence]);
}

// Infer a cadence from the median gap between consecutive charges. Returns a
// cadence label or null when the gaps are too irregular to be a subscription.
function inferCadence(dates) {
  if (dates.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i] - dates[i - 1]) / 86400000);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  const near = (target, tol) => Math.abs(median - target) <= tol;
  if (near(7, 2)) return 'weekly';
  if (near(14, 3)) return 'fortnightly';
  if (near(30, 6)) return 'monthly';
  if (near(365, 20)) return 'yearly';
  return null;
}

function normaliseMerchant(desc) {
  const cleaned = String(desc || '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')           // drop digits + punctuation (ref ids, dates)
    .replace(/\b(pty|ltd|au|australia|sydney|melbourne|pos|purchase|card|value|date)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Key on the leading merchant word(s). Bank descriptions lead with the
  // merchant and trail with per-charge ref noise (e.g. "SPOTIFY P1A2B3 AU"),
  // so the first meaningful token (or two, for names like "harvey norman")
  // is the stable identity.
  // Use the FIRST meaningful word as the merchant key — bank descriptions lead
  // with the merchant and trail with per-charge ref noise ("SPOTIFY P1A2B3 AU").
  // Combined with the amount key, the first word is a stable identity that
  // ignores that noise. (Multi-word names like "harvey norman" collapse to
  // "harvey", which is fine for grouping recurring charges.)
  const words = cleaned.split(' ').filter((w) => w.length >= 3);
  return (words[0] || cleaned).slice(0, 24);
}

function cleanMerchantLabel(desc) {
  const s = String(desc || '').replace(/\s+/g, ' ').trim();
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISO(d) { const x = new Date(d); return isNaN(x) ? null : x.toISOString().slice(0, 10); }

module.exports = { matchRule, computeAssignments, detectSubscriptions, inferCadence, normaliseMerchant };
