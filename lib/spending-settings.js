'use strict';
// lib/spending-settings.js — pure helpers for Spending settings + budgets
// (Figma flows "Spending settings", "Updating transaction settings",
// "Deleting a budget", 2026-11). No I/O: validation, defaults and the
// "does this category count as spending?" rule live here so they are covered
// by deterministic tests (test/spending-settings.test.js).
//
// Money is AUD. Budgets are monthly. A budget row with category_group = null is
// the overall monthly budget; any other row is a per-category budget using the
// 18-group AU taxonomy in lib/transaction-categories.js.

const { GROUPS, isKnownGroup } = require('./transaction-categories');

// Groups that move money around rather than spend it. Excluded from spending
// totals by default so a card repayment or a transfer to savings isn't counted
// twice. The user can change this in Manage categories.
const DEFAULT_EXCLUDED_GROUPS = Object.freeze(['Income', 'Credit Card Payments', 'Transfers']);

const DEFAULT_SETTINGS = Object.freeze({
  include_upcoming: true,
  excluded_groups: DEFAULT_EXCLUDED_GROUPS,
});

const MAX_BUDGET_AUD = 10_000_000; // a monthly budget above $10m is a typo

/** Merge a stored settings blob over the defaults; drops unknown keys/groups. */
function normaliseSettings(stored) {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const include_upcoming = typeof s.include_upcoming === 'boolean' ? s.include_upcoming : DEFAULT_SETTINGS.include_upcoming;
  const excluded_groups = Array.isArray(s.excluded_groups)
    ? GROUPS.filter((g) => s.excluded_groups.includes(g))
    : [...DEFAULT_EXCLUDED_GROUPS];
  return { include_upcoming, excluded_groups };
}

/**
 * Validate a settings PATCH. Returns { patch } with only valid keys, or
 * { error } when the body is unusable. Unknown groups are rejected rather than
 * silently dropped so the client never thinks a typo was saved.
 */
function validateSettingsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Nothing to update.' };
  const patch = {};
  if ('include_upcoming' in body) {
    if (typeof body.include_upcoming !== 'boolean') return { error: 'Upcoming spend must be on or off.' };
    patch.include_upcoming = body.include_upcoming;
  }
  if ('excluded_groups' in body) {
    if (!Array.isArray(body.excluded_groups)) return { error: 'Excluded categories must be a list.' };
    const bad = body.excluded_groups.find((g) => !isKnownGroup(g));
    if (bad !== undefined) return { error: 'Unknown category.' };
    patch.excluded_groups = GROUPS.filter((g) => body.excluded_groups.includes(g));
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to update.' };
  return { patch };
}

/** Does a transaction in this category group count towards spending? */
function countsAsSpending(group, settings) {
  const s = normaliseSettings(settings);
  return !s.excluded_groups.includes(group || 'Other');
}

/**
 * Parse a monthly budget amount in AUD. Accepts numbers or strings like
 * "$1,250.50". Rounds to cents. Returns null when invalid (<= 0, NaN, too big).
 */
function parseBudgetAmount(v) {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const cleaned = v.replace(/[\s,$]/g, '').replace(/^AUD/i, '');
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    n = Number(cleaned);
  } else return null;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0 || rounded > MAX_BUDGET_AUD) return null;
  return rounded;
}

/** Validate a budget upsert body → { budget: { category_group, monthly_amount } } | { error }. */
function validateBudgetInput(body) {
  const b = body && typeof body === 'object' ? body : {};
  const group = b.category_group == null || b.category_group === '' ? null : b.category_group;
  if (group !== null && !isKnownGroup(group)) return { error: 'Pick a valid category.' };
  const amount = parseBudgetAmount(b.monthly_amount);
  if (amount === null) return { error: 'Enter a monthly amount above $0.' };
  return { budget: { category_group: group, monthly_amount: amount } };
}

/** Parse a positive integer row id (string form, for BIGINT). */
function parseId(v) {
  const s = String(v == null ? '' : v);
  return /^[1-9]\d{0,17}$/.test(s) ? s : null;
}

/** Shape a db row for the client. BIGINT/NUMERIC come back as strings. */
function toBudget(row) {
  return {
    id: String(row.id),
    category_group: row.category_group || null,
    monthly_amount: Math.round(Number(row.monthly_amount) * 100) / 100,
    updated_at: row.updated_at || null,
  };
}

/** Sum of the budgets: the overall budget when set, else the per-category total. */
function totalMonthlyBudget(budgets) {
  const list = Array.isArray(budgets) ? budgets : [];
  const overall = list.find((b) => !b.category_group);
  if (overall) return Math.round(Number(overall.monthly_amount) * 100) / 100;
  const cents = list.reduce((acc, b) => acc + Math.round(Number(b.monthly_amount) * 100), 0);
  return cents / 100;
}

module.exports = {
  DEFAULT_EXCLUDED_GROUPS,
  DEFAULT_SETTINGS,
  MAX_BUDGET_AUD,
  normaliseSettings,
  validateSettingsPatch,
  countsAsSpending,
  parseBudgetAmount,
  validateBudgetInput,
  parseId,
  toBudget,
  totalMonthlyBudget,
};
