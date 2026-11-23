// shared/report-url.mjs — Spending › Reports settings <-> URL search params.
// Pure: test/report-url.test.js covers it.
//
// Only SAFE fields go in the URL: tab, date preset / custom from-to, grouping,
// chart type, view-by, the selected built-in category groups and the open saved
// view's id. The merchant text filter never does: it is free text the user
// typed and URLs end up in history and logs. Every param is checked against a
// whitelist; anything unknown falls back to the default and raw param text is
// never passed through.

const TABS = ["cashflow", "expenses", "income", "transfers"];
const PRESETS = ["this-month", "last-month", "3m", "6m", "12m", "ytd", "fy", "last-fy", "custom"];
const INTERVALS = ["week", "month", "quarter"];
const VIEW_BY = ["category", "merchant"];
const CASH_CHARTS = ["net", "split", "flow"];
const OTHER_CHARTS = ["bars", "donut"];
/** The 18 built-in groups (lib/transaction-categories.js). */
export const URL_GROUPS = Object.freeze([
  "Income", "Credit Card Payments", "Transfers", "Financial", "Savings & Investments", "Housing",
  "Bills & Utilities", "Food & Dining", "Health & Wellness", "Auto & Transport", "Shopping",
  "Travel & Lifestyle", "Education", "Children", "Recurring & Subscriptions", "Business",
  "Gifts & Donations", "Other",
]);

export const DEFAULT_REPORT = Object.freeze({
  tab: "cashflow", chart: "net", interval: "month", viewBy: "category", range: Object.freeze({ preset: "6m" }),
});

const pick = (v, list) => (typeof v === "string" && list.includes(v) ? v : undefined);
const isDay = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * Validate raw search params into a clean ReportSearch. Unknown or malformed
 * values are dropped (so the page uses its default). Returns only the keys
 * that passed: { tab, preset, from, to, interval, chart, viewBy, groups, view }.
 */
export function parseReportSearch(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const out = {};
  const tab = pick(s.tab, TABS);
  if (tab) out.tab = tab;
  const preset = pick(s.preset, PRESETS);
  if (preset === "custom") {
    if (isDay(s.from) && isDay(s.to) && s.from <= s.to) { out.preset = "custom"; out.from = s.from; out.to = s.to; }
  } else if (preset) out.preset = preset;
  const interval = pick(s.interval, INTERVALS);
  if (interval) out.interval = interval;
  const chart = pick(s.chart, (tab ?? DEFAULT_REPORT.tab) === "cashflow" ? CASH_CHARTS : OTHER_CHARTS);
  if (chart) out.chart = chart;
  const viewBy = pick(s.viewBy, VIEW_BY);
  if (viewBy) out.viewBy = viewBy;
  const rawGroups = Array.isArray(s.groups) ? s.groups : typeof s.groups === "string" ? s.groups.split(",") : [];
  const groups = [...new Set(rawGroups.filter((g) => typeof g === "string" && URL_GROUPS.includes(g)))];
  if (groups.length) out.groups = groups.sort((a, b) => URL_GROUPS.indexOf(a) - URL_GROUPS.indexOf(b));
  if (typeof s.view === "string" && /^[A-Za-z0-9-]{1,64}$/.test(s.view)) out.view = s.view;
  else if (typeof s.view === "number" && Number.isSafeInteger(s.view) && s.view > 0) out.view = String(s.view);
  return out;
}

/** Report config (without the merchant filter) from a validated search. */
export function configFromSearch(search) {
  const s = parseReportSearch(search);
  const tab = s.tab ?? DEFAULT_REPORT.tab;
  const chart = s.chart ?? (tab === "cashflow" ? "net" : "bars");
  return {
    tab, chart,
    interval: s.interval ?? DEFAULT_REPORT.interval,
    viewBy: s.viewBy ?? DEFAULT_REPORT.viewBy,
    range: s.preset === "custom" ? { preset: "custom", from: s.from, to: s.to } : { preset: s.preset ?? DEFAULT_REPORT.range.preset },
    groups: s.groups ?? [],
  };
}

/**
 * Search params for a report config. Defaults are left out so a plain report
 * has a clean URL; the merchant filter is never included. `view` is the open
 * saved view's id (or null).
 */
export function searchFromConfig(config, view) {
  const c = config || {};
  const out = {};
  const tab = pick(c.tab, TABS) ?? DEFAULT_REPORT.tab;
  if (tab !== DEFAULT_REPORT.tab) out.tab = tab;
  const charts = tab === "cashflow" ? CASH_CHARTS : OTHER_CHARTS;
  const chart = pick(c.chart, charts);
  if (chart && chart !== charts[0]) out.chart = chart;
  const interval = pick(c.interval, INTERVALS);
  if (interval && interval !== DEFAULT_REPORT.interval) out.interval = interval;
  const viewBy = pick(c.viewBy, VIEW_BY);
  if (viewBy && viewBy !== DEFAULT_REPORT.viewBy) out.viewBy = viewBy;
  const preset = pick(c.range?.preset, PRESETS);
  if (preset === "custom" && isDay(c.range?.from) && isDay(c.range?.to)) { out.preset = "custom"; out.from = c.range.from; out.to = c.range.to; }
  else if (preset && preset !== "custom" && preset !== DEFAULT_REPORT.range.preset) out.preset = preset;
  const groups = parseReportSearch({ groups: c.filters?.groups ?? c.groups }).groups;
  if (groups) out.groups = groups;
  const v = parseReportSearch({ view: view ?? undefined }).view;
  if (v) out.view = v;
  return out;
}
