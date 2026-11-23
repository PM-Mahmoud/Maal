'use strict';
// lib/report-views.js — server-side validation for Spending Reports
// (/app/spending/reports, HEL-106/HEL-107): saved report views and the
// date-ranged reports transactions query. Pure; covered by
// test/spending-reports.test.js.
//
// A saved view's config is a whitelist-only object; anything unknown is
// dropped, anything malformed is rejected with a user-facing message.
//
//   { tab: 'cashflow'|'expenses'|'income'|'transfers',
//     chart: 'net'|'split'|'flow' (cashflow) | 'bars'|'donut' (others),
//     interval: 'week'|'month'|'quarter',
//     viewBy: 'category'|'merchant',
//     range: { preset, from?, to? },           // from/to only for 'custom'
//     filters: { groups: string[], merchant: string } }

const { TAXONOMY } = require('./transaction-categories');

const TABS = ['cashflow', 'expenses', 'income', 'transfers'];
const CHARTS = { cashflow: ['net', 'split', 'flow'], expenses: ['bars', 'donut'], income: ['bars', 'donut'], transfers: ['bars', 'donut'] };
const INTERVALS = ['week', 'month', 'quarter'];
const VIEW_BY = ['category', 'merchant'];
const PRESETS = ['this-month', 'last-month', '3m', '6m', '12m', 'ytd', 'fy', 'last-fy', 'custom'];
const GROUPS = TAXONOMY.map((t) => t.group);
/** Longest range served by GET /v1/reports/transactions (≈3 years). Matches shared/spending-reports.mjs. */
const MAX_RANGE_DAYS = 1096;
const MAX_NAME = 80;
const MAX_MERCHANT = 60;
/** Saved views per user. */
const MAX_VIEWS = 50;

function isDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const dayNum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

/** Validate a from/to pair: { from, to } or { error }. */
function validateRange(from, to) {
  if (!isDay(from) || !isDay(to)) return { error: 'Choose a valid start and end date.' };
  if (from > to) return { error: 'The start date must be on or before the end date.' };
  if (dayNum(to) - dayNum(from) + 1 > MAX_RANGE_DAYS) return { error: 'Reports cover up to 3 years at a time.' };
  return { from, to };
}

/** Validate and normalise a report config: { config } or { error }. */
function validateReportConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Report settings are missing.' };
  const tab = input.tab;
  if (!TABS.includes(tab)) return { error: 'Unknown report type.' };
  const chart = input.chart;
  if (!CHARTS[tab].includes(chart)) return { error: 'That chart type is not available for this report.' };
  const interval = input.interval === undefined ? 'month' : input.interval;
  if (!INTERVALS.includes(interval)) return { error: 'Unknown grouping.' };
  const viewBy = input.viewBy === undefined ? 'category' : input.viewBy;
  if (!VIEW_BY.includes(viewBy)) return { error: 'Unknown “view by” option.' };

  const r = input.range;
  if (!r || typeof r !== 'object' || !PRESETS.includes(r.preset)) return { error: 'Choose a date range.' };
  const range = { preset: r.preset };
  if (r.preset === 'custom') {
    const v = validateRange(r.from, r.to);
    if (v.error) return v;
    range.from = v.from;
    range.to = v.to;
  }

  const f = input.filters === undefined ? {} : input.filters;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { error: 'Filters are malformed.' };
  const groupsIn = f.groups === undefined ? [] : f.groups;
  if (!Array.isArray(groupsIn) || groupsIn.length > GROUPS.length) return { error: 'Category filter is malformed.' };
  const groups = [];
  for (const g of groupsIn) {
    if (!GROUPS.includes(g)) return { error: 'Unknown category in filters.' };
    if (!groups.includes(g)) groups.push(g);
  }
  const merchantIn = f.merchant === undefined || f.merchant === null ? '' : f.merchant;
  if (typeof merchantIn !== 'string') return { error: 'Merchant filter is malformed.' };
  const merchant = merchantIn.trim();
  if (merchant.length > MAX_MERCHANT) return { error: `Merchant filter must be ${MAX_MERCHANT} characters or fewer.` };

  return { config: { tab, chart, interval, viewBy, range, filters: { groups, merchant } } };
}

function validateName(name) {
  if (typeof name !== 'string' || !name.trim()) return { error: 'Give your report a name.' };
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length > MAX_NAME) return { error: `Names must be ${MAX_NAME} characters or fewer.` };
  return { name: n };
}

/** POST body: { name, config } → { view: { name, config } } or { error }. */
function validateViewInput(body) {
  const b = body || {};
  const n = validateName(b.name);
  if (n.error) return n;
  const c = validateReportConfig(b.config);
  if (c.error) return c;
  return { view: { name: n.name, config: c.config } };
}

/** PATCH body: { name?, config? } (at least one) → { patch } or { error }. */
function validateViewPatch(body) {
  const b = body || {};
  const patch = {};
  if (b.name !== undefined) {
    const n = validateName(b.name);
    if (n.error) return n;
    patch.name = n.name;
  }
  if (b.config !== undefined) {
    const c = validateReportConfig(b.config);
    if (c.error) return c;
    patch.config = c.config;
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to update.' };
  return { patch };
}

/** DB row → API shape. */
function toView(row) {
  return {
    id: String(row.id),
    name: row.name,
    config: row.config,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

module.exports = {
  TABS, CHARTS, INTERVALS, VIEW_BY, PRESETS, MAX_RANGE_DAYS, MAX_NAME, MAX_MERCHANT, MAX_VIEWS,
  isDay, validateRange, validateReportConfig, validateName, validateViewInput, validateViewPatch, toView,
};
