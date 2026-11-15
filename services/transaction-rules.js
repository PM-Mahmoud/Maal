'use strict';
// services/transaction-rules.js
// Pure logic for the transaction rules engine + subscriptions detection
// (specs/silvia-parity-tier1-2.md, PR 6). Kept side-effect-free so it can be
// unit-tested deterministically; the DB wiring lives in routes/api.js.

// Does a rule match a transaction? Every condition the rule sets must hold
// (AND); a rule with no conditions at all never matches.
//   - merchant:   match_text on the description, case-insensitive;
//                 match_type 'contains' (default) | 'equals' | 'starts_with'
//   - type:       amount_direction 'debit' (money out) | 'credit' (money in)
//   - amount:     conditions.amount { op: 'eq'|'gt'|'lt', value } on |amount|,
//                 compared in whole cents so $100.00 equals -100 exactly
//   - categories: conditions.categories [group, ...] on the transaction's
//                 (effective) category_group
//   - date:       conditions.date { from, to } inclusive ISO dates on post_date
// Legacy rules (match_text + optional direction, no conditions) behave exactly
// as before.
function matchRule(rule, txn) {
  if (!rule || !txn) return false;
  const conditions = (rule.conditions && typeof rule.conditions === 'object') ? rule.conditions : {};
  let checked = 0;

  const needle = String(rule.match_text || '').toLowerCase();
  if (needle.trim()) {
    checked++;
    const text = String(txn.description || '').toLowerCase();
    const ok = rule.match_type === 'equals' ? text === needle
      : rule.match_type === 'starts_with' ? text.startsWith(needle)
      : text.includes(needle);
    if (!ok) return false;
  }

  const direction = rule.amount_direction || 'any';
  if (direction !== 'any') {
    checked++;
    if (amountDirection(txn.amount) !== direction) return false;
  }

  const amount = conditions.amount;
  if (amount && AMOUNT_OPS.includes(amount.op) && amount.value !== null && amount.value !== ''
    && Number.isFinite(Number(amount.value))) {
    checked++;
    const actual = toCents(Math.abs(Number(txn.amount) || 0));
    const target = toCents(Math.abs(Number(amount.value)));
    const ok = amount.op === 'eq' ? actual === target : amount.op === 'gt' ? actual > target : actual < target;
    if (!ok) return false;
  }

  if (Array.isArray(conditions.categories) && conditions.categories.length) {
    checked++;
    if (!conditions.categories.includes(txn.category_group)) return false;
  }

  const date = conditions.date;
  if (date && (date.from || date.to)) {
    checked++;
    const day = isoDay(txn.post_date);
    if (!day) return false;
    if (date.from && day < date.from) return false;
    if (date.to && day > date.to) return false;
  }

  return checked > 0;
}

const AMOUNT_OPS = ['eq', 'gt', 'lt'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function toCents(n) { return Math.round(n * 100); }
function isoDay(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  // node-postgres parses a DATE column to LOCAL midnight — read local parts so
  // a non-UTC server never shifts the day.
  if (value instanceof Date && !isNaN(value)) {
    const p = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  const d = new Date(value);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// Validate + normalise rule input from the client. Create AND preview share
// this, so a preview always runs against exactly what would be saved.
// `requireCategory: false` is for previews (the update can be picked later).
// Returns { ok: true, rule } or { ok: false, error }. Pure.
function normaliseRuleInput(input, opts = {}) {
  const { isKnownGroup, isValidCategory } = require('../lib/transaction-categories');
  const d = (input && typeof input === 'object') ? input : {};
  const match_text = String(d.match_text || '').trim().slice(0, 120);
  const match_type = ['contains', 'equals', 'starts_with'].includes(d.match_type) ? d.match_type : 'contains';
  const amount_direction = ['any', 'debit', 'credit'].includes(d.amount_direction) ? d.amount_direction : 'any';
  const raw = (d.conditions && typeof d.conditions === 'object') ? d.conditions : {};
  const conditions = {};

  if (raw.amount && raw.amount.value !== '' && raw.amount.value != null) {
    const value = Number(raw.amount.value);
    if (!AMOUNT_OPS.includes(raw.amount.op)) return { ok: false, error: 'Pick how to compare the amount.' };
    if (!Number.isFinite(value) || value < 0 || value > 1e9) return { ok: false, error: 'Enter a valid amount.' };
    conditions.amount = { op: raw.amount.op, value: toCents(value) / 100 };
  }
  if (Array.isArray(raw.categories) && raw.categories.length) {
    const groups = [...new Set(raw.categories.map(String))];
    if (!groups.every(isKnownGroup)) return { ok: false, error: 'Unknown category.' };
    conditions.categories = groups;
  }
  if (raw.date && (raw.date.from || raw.date.to)) {
    const from = raw.date.from ? String(raw.date.from) : null;
    const to = raw.date.to ? String(raw.date.to) : null;
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) return { ok: false, error: 'Enter valid dates.' };
    if (from && to && from > to) return { ok: false, error: 'The start date must be on or before the end date.' };
    conditions.date = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }

  const hasCondition = !!match_text || amount_direction !== 'any' || Object.keys(conditions).length > 0;
  if (!hasCondition) return { ok: false, error: 'Add at least one condition.' };

  const category_group = d.category_group ? String(d.category_group) : '';
  const category = d.category ? String(d.category) : '';
  if (opts.requireCategory !== false || category_group) {
    if (!isKnownGroup(category_group)) return { ok: false, error: 'Pick a category to update to.' };
    if (!isValidCategory(category_group, category || undefined)) return { ok: false, error: 'Pick a valid category.' };
  }

  return {
    ok: true,
    rule: {
      name: d.name ? String(d.name).slice(0, 80) : null,
      match_type, match_text, amount_direction, conditions,
      category_group: category_group || null, category: category || null,
      priority: Math.max(-100, Math.min(100, Math.round(Number(d.priority) || 0))),
    },
  };
}

// The category a rule's "Categories" condition sees: the stored category, or
// the keyword auto-category the transactions list shows when none is stored.
function withEffectiveCategory(rows) {
  const { autoCategorize } = require('../lib/transaction-categories');
  return (rows || []).map((r) => {
    if (r.category_group) return r;
    const auto = autoCategorize(r.description, r.amount);
    return auto ? { ...r, category_group: auto.group, category: auto.category, category_source: 'auto' } : r;
  });
}

// The transactions a rule would update — never one the user categorised by
// hand. Shared by the preview endpoint and both apply endpoints, so
// preview == apply by construction. Pure.
function selectRuleMatches(rule, rows) {
  return withEffectiveCategory(rows)
    .filter((r) => r.category_source !== 'manual')
    .filter((r) => matchRule(rule, r));
}

// Narrow a rule's matches to the member's review-step selection: drop
// exclude_ids, and when include_ids is given keep only those. Always a subset
// of `matches`, so a selection can never reach beyond the rule. Pure.
function filterSelection(matches, sel = {}) {
  const exclude = new Set((Array.isArray(sel.exclude_ids) ? sel.exclude_ids : []).map(String));
  const include = Array.isArray(sel.include_ids) ? new Set(sel.include_ids.map(String)) : null;
  return (matches || []).filter((r) => !exclude.has(String(r.id)) && (!include || include.has(String(r.id))));
}

// One page of a rule's matches for the preview UI (total + capped items). Pure.
function previewRuleMatches(rule, rows, opts = {}) {
  const limit = Math.max(1, Math.min(200, Math.round(Number(opts.limit) || 50)));
  const offset = Math.max(0, Math.round(Number(opts.offset) || 0));
  const matches = selectRuleMatches(rule, rows);
  return {
    total: matches.length,
    offset,
    limit,
    items: matches.slice(offset, offset + limit).map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      post_date: isoDay(r.post_date),
      status: r.status || null,
      category_group: r.category_group || null,
      category: r.category || null,
    })),
  };
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

function detectRecurringTransactions(txns, options = {}) {
  const minOccurrences = options.minOccurrences || 3;
  const now = options.now ? new Date(options.now) : new Date();
  const groups = new Map();
  for (const transaction of txns || []) {
    if (!transaction.post_date || transaction.status === 'pending'
      || transaction.relationship_type || !amountDirection(transaction.amount)) continue;
    const merchantKey = normaliseMerchantIdentity(transaction.description);
    if (!merchantKey) continue;
    const key = `${amountDirection(transaction.amount)}|${merchantKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(transaction);
  }
  const recurring = [];
  for (const items of groups.values()) {
    if (items.length < minOccurrences) continue;
    const ordered = [...items].sort((a, b) => new Date(a.post_date) - new Date(b.post_date));
    const cadence = inferCadence(ordered.map((item) => new Date(item.post_date)));
    if (!cadence) continue;
    const cadenceTolerance = { weekly: 2, fortnightly: 3, monthly: 6, yearly: 20 }[cadence];
    const cadenceDays = CADENCE_DAYS[cadence];
    const gaps = ordered.slice(1).map((item, index) =>
      (new Date(item.post_date) - new Date(ordered[index].post_date)) / 86400000
    );
    if (gaps.filter((gap) => Math.abs(gap - cadenceDays) <= cadenceTolerance).length
      < Math.ceil(gaps.length * 0.67)) continue;
    const amounts = ordered.map((item) => Math.abs(Number(item.amount)));
    const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const spread = average ? (Math.max(...amounts) - Math.min(...amounts)) / average : Infinity;
    if (spread > 0.35) continue;
    const latest = ordered.at(-1);
    const ageDays = (now - new Date(latest.post_date)) / 86400000;
    if (ageDays < 0 || ageDays > cadenceDays * 2) continue;
    const text = ordered.map((item) => item.description || '').join(' ').toLowerCase();
    const income = Number(latest.amount) > 0;
    const subscription = !income && (latest.category_group === 'Recurring & Subscriptions'
      || /\b(netflix|spotify|subscription|membership|software|streaming|icloud|adobe)\b/.test(text));
    const kind = income ? 'income' : subscription ? 'subscription' : 'bill';
    const confidence = Math.max(0.5, Math.min(0.99,
      0.65 + Math.min(ordered.length - minOccurrences, 3) * 0.05 + (spread <= 0.1 ? 0.15 : 0)
    ));
    recurring.push({
      kind, merchant: cleanMerchantLabel(latest.description), merchant_key: normaliseMerchantIdentity(latest.description),
      averageAmount: Number(average.toFixed(2)), minAmount: Math.min(...amounts), maxAmount: Math.max(...amounts),
      cadence, confidence: Number(confidence.toFixed(2)), occurrences: ordered.length,
      lastDate: toISO(latest.post_date), nextEstimate: toISO(addDays(new Date(latest.post_date), CADENCE_DAYS[cadence])),
    });
  }
  return recurring.sort((a, b) => b.confidence - a.confidence || b.averageAmount - a.averageAmount);
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

// Payment-processor / network / channel prefixes that lead a description but
// are NOT the merchant (e.g. "EFTPOS SPOTIFY", "DIRECT DEBIT AGL", "VISA NETFLIX").
// Stripping them stops different billers collapsing onto the same key.
const MERCHANT_STOPWORDS = /\b(pty|ltd|au|australia|sydney|melbourne|pos|purchase|card|value|date|eftpos|direct|debit|bpay|visa|mastercard|amex|transfer|transaction|payment|pay|withdrawal|deposit|osko|payid)\b/g;

function normaliseMerchant(desc) {
  const cleaned = String(desc || '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')           // drop digits + punctuation (ref ids, dates)
    .replace(MERCHANT_STOPWORDS, ' ')
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

function normaliseMerchantIdentity(desc) {
  const cleaned = String(desc || '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(MERCHANT_STOPWORDS, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').filter((word) => word.length >= 3).slice(0, 2).join(' ').slice(0, 48);
}

function amountDirection(amount) {
  const value = Number(amount);
  if (value < 0) return 'debit';
  if (value > 0) return 'credit';
  return null;
}

function computeLearnedSuggestions(preferences, txns, options = {}) {
  const minConfirmations = options.minConfirmations || 2;
  const minConfidence = options.minConfidence || (2 / 3);
  const learned = new Map();
  for (const preference of preferences || []) {
    const confidence = Number(preference.confirmations) / Number(preference.total);
    if (Number(preference.confirmations) < minConfirmations || confidence < minConfidence) continue;
    const preferenceKey = `${preference.merchant_key}|${preference.amount_direction || 'any'}`;
    const existing = learned.get(preferenceKey);
    if (!existing || confidence > existing.confidence) {
      learned.set(preferenceKey, { ...preference, confidence });
    }
  }
  const suggestions = [];
  for (const transaction of txns || []) {
    const merchantKey = normaliseMerchantIdentity(transaction.description);
    const direction = amountDirection(transaction.amount);
    if (!merchantKey || !direction) continue;
    const match = learned.get(`${merchantKey}|${direction}`)
      || learned.get(`${merchantKey}|any`);
    if (!match) continue;
    suggestions.push({
      transaction_id: transaction.id,
      category_group: match.category_group,
      category: match.category || null,
      confidence: Number(match.confidence.toFixed(4)),
      merchant_key: merchantKey,
    });
  }
  return suggestions;
}

function cleanMerchantLabel(desc) {
  const s = String(desc || '').replace(/\s+/g, ' ').trim();
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISO(d) { const x = new Date(d); return isNaN(x) ? null : x.toISOString().slice(0, 10); }

module.exports = {
  matchRule, computeAssignments, computeLearnedSuggestions,
  normaliseRuleInput, withEffectiveCategory, selectRuleMatches, filterSelection, previewRuleMatches,
  detectSubscriptions, detectRecurringTransactions, inferCadence, normaliseMerchant,
  normaliseMerchantIdentity, amountDirection,
};
