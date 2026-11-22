'use strict';

// test/spending-reports.test.js
// Deterministic tests for the Spending Reports page (HEL-106/HEL-107):
//   shared/spending-reports.mjs — range presets, periods, cash flow, stacked
//     breakdowns, transfers, period changes, filters, saved-view helpers;
//   lib/report-views.js — server-side validation of saved-view configs and
//     the reports date range.
// No DB, no network. Dates are local and fixed.

const assert = require('assert');
const rv = require('../lib/report-views');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const m = await import('../shared/spending-reports.mjs');
  console.log('\nspending-reports');

  const T = (id, day, amount, group, extra = {}) => ({ id, post_date: day, amount: String(amount), category_group: group, ...extra });
  const txns = [
    T(1, '2026-09-03', -1950, 'Housing', { category: 'Rent', description: 'Rent — Ray White' }),
    T(2, '2026-09-15', 3650, 'Income', { category: 'Salary & wages', description: 'Salary — Acme' }),
    T(3, '2026-09-20', -92.4, 'Food & Dining', { description: 'Woolworths' }),
    T(4, '2026-10-02', -50.1, 'Food & Dining', { description: 'Coles' }),
    T(5, '2026-10-05', -249, 'Shopping', { description: 'JB Hi-Fi' }),
    T(6, '2026-10-15', 3650, 'Income', { category: 'Salary & wages', description: 'Salary — Acme' }),
    T(7, '2026-10-16', -500, 'Transfers', { description: 'Transfer to savings' }),
    T(8, '2026-10-16', 500, 'Bills & Utilities', { description: 'From everyday', relationship_type: 'transfer' }),
    T(9, '2026-10-26', -620, 'Credit Card Payments', { description: 'Card payment' }),
    T(10, '2026-11-01', 12.4, 'Income', { category: 'Interest', description: 'ING interest' }),
    T(11, '2026-11-04', -38.2, 'Auto & Transport', { description: 'Opal' }),
    T(12, '2026-11-06', 20, 'Shopping', { description: 'JB Hi-Fi refund' }),
    T(13, '2026-11-08', -100, 'Shopping', { description: 'Kmart' }),
  ];
  const today = new Date(2026, 10, 22); // 22 Nov 2026

  await test('resolveRange: rolling presets cover whole months to today', () => {
    assert.deepStrictEqual(m.resolveRange({ preset: '6m' }, today), { preset: '6m', custom: false, from: '2026-06-01', to: '2026-11-22' });
    assert.strictEqual(m.resolveRange({ preset: '3m' }, today).from, '2026-09-01');
    assert.strictEqual(m.resolveRange({ preset: '12m' }, today).from, '2025-12-01');
    assert.strictEqual(m.resolveRange({ preset: 'this-month' }, today).from, '2026-11-01');
  });

  await test('resolveRange: last month, YTD and Australian financial years', () => {
    assert.deepStrictEqual(m.resolveRange({ preset: 'last-month' }, today), { preset: 'last-month', custom: false, from: '2026-10-01', to: '2026-10-31' });
    assert.strictEqual(m.resolveRange({ preset: 'ytd' }, today).from, '2026-01-01');
    assert.deepStrictEqual(m.resolveRange({ preset: 'fy' }, today), { preset: 'fy', custom: false, from: '2026-07-01', to: '2026-11-22' });
    assert.deepStrictEqual(m.resolveRange({ preset: 'last-fy' }, today), { preset: 'last-fy', custom: false, from: '2025-07-01', to: '2026-06-30' });
    // Before 1 July the FY started the previous year.
    assert.strictEqual(m.resolveRange({ preset: 'fy' }, new Date(2026, 2, 2)).from, '2025-07-01');
    assert.strictEqual(m.resolveRange({ preset: 'last-month' }, new Date(2026, 0, 10)).from, '2025-12-01');
  });

  await test('resolveRange: custom ranges validated; unknown preset → 6 months', () => {
    assert.deepStrictEqual(m.resolveRange({ preset: 'custom', from: '2025-10-01', to: '2026-03-02' }, today),
      { preset: 'custom', custom: true, from: '2025-10-01', to: '2026-03-02' });
    assert.strictEqual(m.resolveRange({ preset: 'custom', from: '2026-03-02', to: '2025-10-01' }, today), null);
    assert.strictEqual(m.resolveRange({ preset: 'custom', from: '2026-02-30', to: '2026-03-02' }, today), null);
    assert.strictEqual(m.resolveRange({ preset: 'custom', from: '2020-01-01', to: '2026-01-01' }, today), null);
    assert.strictEqual(m.resolveRange({ preset: 'bogus' }, today).preset, '6m');
    assert.strictEqual(m.resolveRange(null, today).from, '2026-06-01');
  });

  await test('periods: months clipped to the range', () => {
    const p = m.periods('2025-10-15', '2026-01-10', 'month');
    assert.deepStrictEqual(p.map((x) => x.key), ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01']);
    assert.strictEqual(p[0].start, '2025-10-15');
    assert.strictEqual(p[0].end, '2025-10-31');
    assert.strictEqual(p[3].end, '2026-01-10');
    assert.deepStrictEqual(m.periods('2026-03-02', '2025-10-01', 'month'), []);
  });

  await test('periods: Monday-start weeks and calendar quarters', () => {
    const w = m.periods('2026-11-04', '2026-11-22', 'week'); // Wed 4 Nov … Sun 22 Nov
    assert.deepStrictEqual(w.map((x) => x.key), ['2026-11-02', '2026-11-09', '2026-11-16']);
    assert.strictEqual(w[0].start, '2026-11-04');
    assert.strictEqual(w[2].end, '2026-11-22');
    const q = m.periods('2025-07-01', '2026-06-30', 'quarter');
    assert.deepStrictEqual(q.map((x) => [x.start, x.end]), [
      ['2025-07-01', '2025-09-30'], ['2025-10-01', '2025-12-31'], ['2026-01-01', '2026-03-31'], ['2026-04-01', '2026-06-30'],
    ]);
  });

  await test('kindOf: transfers, card payments and own-account legs are not income or spending', () => {
    assert.strictEqual(m.kindOf(txns[6], undefined), 'transfer');
    assert.strictEqual(m.kindOf(txns[7], undefined), 'transfer');
    assert.strictEqual(m.kindOf(txns[8], undefined), 'transfer');
    assert.strictEqual(m.kindOf(txns[1], undefined), 'income');
    assert.strictEqual(m.kindOf(txns[11], undefined), 'income'); // refund = money in
    assert.strictEqual(m.kindOf(txns[0], undefined), 'expense');
    assert.strictEqual(m.kindOf(txns[0], ['Housing']), null);       // excluded by settings
  });

  await test('cashFlowByPeriod + cashFlowTotals: whole-cent sums per month', () => {
    const rows = m.cashFlowByPeriod(txns, '2026-09-01', '2026-11-22', 'month', undefined);
    assert.deepStrictEqual(rows.map((r) => [r.key, r.income, r.expenses, r.net]), [
      ['2026-09-01', 3650, 2042.4, 1607.6],
      ['2026-10-01', 3650, 299.1, 3350.9],
      ['2026-11-01', 32.4, 138.2, -105.8],
    ]);
    const s = m.cashFlowTotals(rows);
    assert.deepStrictEqual(s, { income: 7332.4, expenses: 2479.7, net: 4852.7, avgPerPeriod: 1617.57 });
    assert.deepStrictEqual(m.cashFlowTotals([]), { income: 0, expenses: 0, net: 0, avgPerPeriod: 0 });
  });

  await test('breakdown: expenses by category and merchant, top-N fold, pct', () => {
    const b = m.breakdown(txns, 'expense', 'category', undefined);
    assert.strictEqual(b.total, 2479.7);
    assert.deepStrictEqual(b.rows.map((r) => [r.label, r.amount]), [
      ['Housing', 1950], ['Shopping', 349], ['Food & Dining', 142.5], ['Auto & Transport', 38.2],
    ]);
    assert.strictEqual(b.rows[0].group, 'Housing');
    assert.strictEqual(b.rows[0].pct, 78.64);
    const top = m.breakdown(txns, 'expense', 'category', undefined, 2);
    assert.deepStrictEqual(top.rows.map((r) => [r.label, r.amount, r.count]), [
      ['Housing', 1950, 1], ['Shopping', 349, 2], ['Everything else', 180.7, 3],
    ]);
    const merch = m.breakdown(txns, 'expense', 'merchant', undefined);
    assert.strictEqual(merch.rows[0].label, 'Rent — Ray White');
    assert.strictEqual(merch.rows[0].group, null);
    const inc = m.breakdown(txns, 'income', 'category', undefined);
    assert.deepStrictEqual(inc.rows.map((r) => [r.label, r.amount]), [['Salary & wages', 7300], ['Other income', 20], ['Interest', 12.4]]);
    assert.deepStrictEqual(m.breakdown([], 'expense', 'category', undefined), { total: 0, rows: [] });
  });

  await test('stackedByPeriod: segments line up across periods and sum to each total', () => {
    const s = m.stackedByPeriod(txns, 'expense', '2026-09-01', '2026-11-22', 'month', 'category', undefined, 2);
    assert.deepStrictEqual(s.labels, ['Housing', 'Shopping', 'Everything else']);
    assert.deepStrictEqual(s.rows.map((r) => r.segments), [[1950, 0, 92.4], [0, 249, 50.1], [0, 100, 38.2]]);
    assert.deepStrictEqual(s.rows.map((r) => r.total), [2042.4, 299.1, 138.2]);
  });

  await test('transfersByPeriod: money in and out of own-account moves', () => {
    const rows = m.transfersByPeriod(txns, '2026-09-01', '2026-11-22', 'month');
    assert.deepStrictEqual(rows.map((r) => [r.moneyIn, r.moneyOut, r.total]), [[0, 0, 0], [500, 1120, 1620], [0, 0, 0]]);
    const b = m.breakdown(txns, 'transfer', 'category', undefined);
    assert.deepStrictEqual(b.rows.map((r) => [r.label, r.amount]), [['Credit Card Payments', 620], ['Bills & Utilities', 500], ['Transfers', 500]]);
  });

  await test('periodChanges + totalsOf', () => {
    assert.deepStrictEqual(m.periodChanges([100, 50, 0, 80]), [null, -50, -100, null]);
    assert.deepStrictEqual(m.periodChanges([]), []);
    assert.deepStrictEqual(m.totalsOf([0.1, 0.2, 100]), { total: 100.3, avgPerPeriod: 33.43 });
  });

  await test('applyFilters: date window, category groups, merchant text', () => {
    assert.strictEqual(m.applyFilters(txns, m.emptyFilters(), '2026-10-01', '2026-10-31').length, 6);
    const shop = m.applyFilters(txns, { groups: ['Shopping'], merchant: '' }, '2026-09-01', '2026-11-30');
    assert.deepStrictEqual(shop.map((t) => t.id), [5, 12, 13]);
    const jb = m.applyFilters(txns, { groups: [], merchant: ' jb hi ' }, null, null);
    assert.deepStrictEqual(jb.map((t) => t.id), [5, 12]);
    assert.strictEqual(m.activeFilterCount({ groups: ['Shopping'], merchant: 'jb' }), 2);
    assert.strictEqual(m.activeFilterCount(m.emptyFilters()), 0);
  });

  await test('suggestViewName + sameConfig', () => {
    const cfg = { tab: 'expenses', chart: 'donut', interval: 'month', viewBy: 'category', range: { preset: 'custom', from: '2025-10-01', to: '2026-03-02' },
      filters: { groups: ['Shopping', 'Auto & Transport', 'Health & Wellness'], merchant: '' } };
    assert.strictEqual(m.suggestViewName(cfg), 'Expenses (Shopping, Auto & Transport, Health & Wellness)');
    assert.strictEqual(m.suggestViewName({ tab: 'cashflow', range: { preset: '12m' }, filters: {} }), 'Cash flow (Last 12 months)');
    assert.strictEqual(m.suggestViewName({ tab: 'income', range: { preset: 'custom' }, filters: { groups: [], merchant: 'Acme' } }), 'Income (“Acme”)');
    assert.ok(m.sameConfig(cfg, { ...cfg, filters: { groups: ['Health & Wellness', 'Shopping', 'Auto & Transport'], merchant: ' ' } }));
    assert.ok(!m.sameConfig(cfg, { ...cfg, chart: 'bars' }));
    // from/to only matter for custom ranges.
    assert.ok(m.sameConfig({ ...cfg, range: { preset: '6m' } }, { ...cfg, range: { preset: '6m', from: 'x', to: 'y' } }));
  });

  await test('reports on effectiveTransactions(): hidden rows dropped, splits counted per part', async () => {
    const { effectiveTransactions } = await import('../shared/transaction-splits.mjs');
    const rows = [
      T(1, '2026-10-02', -100, 'Shopping', { description: 'Kmart', splits: [
        { amount: 60, category_group: 'Shopping' }, { amount: 40, category_group: 'Food & Dining' },
      ] }),
      T(2, '2026-10-03', -50, 'Food & Dining', { description: 'Coles', hidden: true }),
      T(3, '2026-10-04', -30, 'Auto & Transport', { description: 'Opal', splits: [
        { amount: 20, category_group: 'Auto & Transport' }, { amount: 10, category_group: 'Shopping', hidden: true },
      ] }),
    ];
    const eff = effectiveTransactions(rows);
    const b = m.breakdown(eff, 'expense', 'category', undefined);
    assert.deepStrictEqual(b.rows.map((r) => [r.label, r.amount]), [['Shopping', 60], ['Food & Dining', 40], ['Auto & Transport', 20]]);
    assert.strictEqual(m.cashFlowByPeriod(eff, '2026-10-01', '2026-10-31', 'month', undefined)[0].expenses, 120);
    // Filtering by category sees the split part's category, not the parent's.
    assert.deepStrictEqual(m.applyFilters(eff, { groups: ['Food & Dining'], merchant: '' }, null, null).map((t) => t.split_of), [1]);
  });

  console.log('\nreport-views (server validation)');

  const good = { tab: 'expenses', chart: 'donut', interval: 'month', viewBy: 'category',
    range: { preset: 'custom', from: '2025-10-01', to: '2026-03-02' }, filters: { groups: ['Shopping', 'Shopping'], merchant: '  JB  ' } };

  await test('validateReportConfig: accepts a full config and normalises it', () => {
    const v = rv.validateReportConfig({ ...good, extra: 'dropped' });
    assert.deepStrictEqual(v, { config: { tab: 'expenses', chart: 'donut', interval: 'month', viewBy: 'category',
      range: { preset: 'custom', from: '2025-10-01', to: '2026-03-02' }, filters: { groups: ['Shopping'], merchant: 'JB' } } });
    const min = rv.validateReportConfig({ tab: 'cashflow', chart: 'net', range: { preset: '6m', from: 'ignored' } });
    assert.deepStrictEqual(min.config, { tab: 'cashflow', chart: 'net', interval: 'month', viewBy: 'category', range: { preset: '6m' }, filters: { groups: [], merchant: '' } });
  });

  await test('validateReportConfig: rejects bad shapes', () => {
    assert.ok(rv.validateReportConfig(null).error);
    assert.ok(rv.validateReportConfig([]).error);
    assert.ok(rv.validateReportConfig({ ...good, tab: 'loans' }).error);
    assert.ok(rv.validateReportConfig({ ...good, chart: 'net' }).error);            // chart not valid for expenses
    assert.ok(rv.validateReportConfig({ ...good, interval: 'day' }).error);
    assert.ok(rv.validateReportConfig({ ...good, viewBy: 'account' }).error);
    assert.ok(rv.validateReportConfig({ ...good, range: { preset: 'forever' } }).error);
    assert.ok(rv.validateReportConfig({ ...good, range: { preset: 'custom', from: '2026-03-02', to: '2025-10-01' } }).error);
    assert.ok(rv.validateReportConfig({ ...good, range: { preset: 'custom', from: '2026-02-30', to: '2026-03-02' } }).error);
    assert.ok(rv.validateReportConfig({ ...good, filters: { groups: ['Crypto'] } }).error);
    assert.ok(rv.validateReportConfig({ ...good, filters: { groups: 'Shopping' } }).error);
    assert.ok(rv.validateReportConfig({ ...good, filters: { merchant: 42 } }).error);
    assert.ok(rv.validateReportConfig({ ...good, filters: { merchant: 'x'.repeat(61) } }).error);
  });

  await test('validateRange: ≤ 3 years, real dates, ordered', () => {
    assert.deepStrictEqual(rv.validateRange('2023-11-23', '2026-11-22'), { from: '2023-11-23', to: '2026-11-22' }); // 1096 days
    assert.ok(rv.validateRange('2023-11-22', '2026-11-22').error);                                              // 1097 days
    assert.ok(rv.validateRange('2026-11-22', '2026-11-21').error);
    assert.ok(rv.validateRange(undefined, '2026-11-21').error);
    assert.ok(rv.validateRange("2026-01-01' OR 1=1", '2026-11-21').error);
    assert.strictEqual(rv.MAX_RANGE_DAYS, m.MAX_RANGE_DAYS);
  });

  await test('validateViewInput / validateViewPatch / toView', () => {
    const v = rv.validateViewInput({ name: '  Expenses   (Shopping) ', config: good });
    assert.strictEqual(v.view.name, 'Expenses (Shopping)');
    assert.ok(rv.validateViewInput({ name: '', config: good }).error);
    assert.ok(rv.validateViewInput({ name: 'x'.repeat(81), config: good }).error);
    assert.ok(rv.validateViewInput({ name: 'ok' }).error);
    assert.deepStrictEqual(rv.validateViewPatch({ name: 'Renamed' }), { patch: { name: 'Renamed' } });
    assert.ok(rv.validateViewPatch({}).error);
    assert.ok(rv.validateViewPatch({ config: { tab: 'nope' } }).error);
    const out = rv.toView({ id: 7, name: 'A', config: good, created_at: new Date('2026-11-22T00:00:00Z'), updated_at: null });
    assert.deepStrictEqual(out, { id: '7', name: 'A', config: good, created_at: '2026-11-22T00:00:00.000Z', updated_at: null });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
