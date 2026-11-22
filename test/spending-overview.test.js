'use strict';

// test/spending-overview.test.js
// Deterministic tests for shared/spending-overview.mjs — the Spending overview
// page's monthly cumulative spend, budget %, category breakdown, budget rows,
// recurring projection, cash-flow aggregation and Sankey grouping.
// No DB, no network. Dates are local and fixed.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const m = await import('../shared/spending-overview.mjs');
  console.log('\nspending-overview');

  // Amounts arrive as strings from NUMERIC columns — mirror that.
  const T = (id, day, amount, group, extra = {}) => ({ id, post_date: day, amount: String(amount), category_group: group, ...extra });
  const txns = [
    T(1, '2026-11-02', -50, 'Food & Dining', { category: 'Groceries' }),
    T(2, '2026-11-02', -20.5, 'Auto & Transport'),
    T(3, '2026-11-05', -100, 'Shopping'),
    T(4, '2026-11-06', -300, 'Transfers'),                       // excluded by default
    T(5, '2026-11-07', -80, 'Bills & Utilities', { relationship_type: 'transfer' }), // own-account leg
    T(6, '2026-11-08', 4000, 'Income', { category: 'Salary & wages' }),
    T(7, '2026-11-09', 500, 'Transfers'),                        // not income
    T(8, '2026-11-25', -999, 'Shopping'),                        // after "today"
    T(9, '2026-10-03', -40, 'Food & Dining'),
    T(10, '2026-10-20', 3900, 'Income', { category: 'Salary & wages' }),
    T(11, '2026-10-21', 12.34, 'Income', { category: 'Interest' }),
    T(12, '2026-09-15', -60, 'Health & Wellness'),
    { id: 13, post_date: '2026-11-03T09:30:00.000Z', amount: -10, category_name: 'Internal transfer' }, // legacy text → Transfers
    { id: 14, amount: -5 },                                      // no date → ignored
  ];
  const today = new Date(2026, 10, 10); // 10 Nov 2026

  await test('countsAsSpend respects excluded groups and transfer pairs', () => {
    assert.strictEqual(m.countsAsSpend(txns[0], undefined), true);
    assert.strictEqual(m.countsAsSpend(txns[3], undefined), false);
    assert.strictEqual(m.countsAsSpend(txns[4], undefined), false);
    assert.strictEqual(m.countsAsSpend(txns[5], undefined), false);
    assert.strictEqual(m.countsAsSpend(txns[12], undefined), false);
    assert.strictEqual(m.countsAsSpend(txns[2], ['Shopping']), false);
    assert.strictEqual(m.countsAsSpend(txns[3], []), true); // user turned Transfers back on
  });

  await test('isIncome skips transfers in', () => {
    assert.strictEqual(m.isIncome(txns[5]), true);
    assert.strictEqual(m.isIncome(txns[6]), false);
    assert.strictEqual(m.isIncome(txns[0]), false);
  });

  await test('monthCumulative: running total, stops at today', () => {
    const r = m.monthCumulative(txns, 2026, 10, undefined, today);
    assert.strictEqual(r.days, 30);
    assert.strictEqual(r.total, 170.5);
    assert.strictEqual(r.daily[1], 70.5);
    assert.strictEqual(r.cumulative[0], 0);
    assert.strictEqual(r.cumulative[1], 70.5);
    assert.strictEqual(r.cumulative[4], 170.5);
    assert.strictEqual(r.cumulative[9], 170.5);
    assert.strictEqual(r.cumulative[10], null);
    assert.strictEqual(r.daily[24], null);
  });

  await test('monthCumulative: past month is complete, future month empty', () => {
    const oct = m.monthCumulative(txns, 2026, 9, undefined, today);
    assert.strictEqual(oct.total, 40);
    assert.strictEqual(oct.cumulative.length, 31);
    assert.strictEqual(oct.cumulative[30], 40);
    const dec = m.monthCumulative(txns, 2026, 11, undefined, today);
    assert.strictEqual(dec.total, 0);
    assert.strictEqual(dec.cumulative[0], null);
  });

  await test('shiftMonth crosses year boundaries', () => {
    assert.deepStrictEqual(m.shiftMonth(2026, 0, 1), { year: 2025, month: 11 });
    assert.deepStrictEqual(m.shiftMonth(2026, 10, 3), { year: 2026, month: 7 });
  });

  await test('budgetUsage: %, remaining, upcoming only when on', () => {
    assert.strictEqual(m.budgetUsage({ spent: 100, budget: 0 }), null);
    assert.strictEqual(m.budgetUsage({ spent: 100, budget: null }), null);
    const a = m.budgetUsage({ spent: 50, budget: '200', upcoming: 30 });
    assert.deepStrictEqual(a, { budget: 200, used: 50, pct: 25, remaining: 150, over: false });
    const b = m.budgetUsage({ spent: 50, budget: 200, upcoming: 30, includeUpcoming: true });
    assert.strictEqual(b.used, 80);
    assert.strictEqual(b.pct, 40);
    const c = m.budgetUsage({ spent: 275.1, budget: 275 });
    assert.strictEqual(c.over, true);
    assert.strictEqual(c.remaining, -0.1);
  });

  await test('categoryBreakdown: largest first, pct of month', () => {
    const r = m.categoryBreakdown(txns, 2026, 10, undefined);
    assert.deepStrictEqual(r.map((x) => x.group), ['Shopping', 'Food & Dining', 'Auto & Transport']);
    assert.strictEqual(r[0].amount, 1099);
    const sum = r.reduce((a, x) => a + x.amount, 0);
    assert.strictEqual(Math.round(sum * 100) / 100, 1169.5);
    assert.strictEqual(r[2].pct, Math.round((20.5 / 1169.5) * 10000) / 100);
  });

  await test('budgetRows: category budgets + "Everything else" from the overall budget', () => {
    const breakdown = [
      { group: 'Shopping', amount: 100 }, { group: 'Food & Dining', amount: 50 }, { group: 'Auto & Transport', amount: 20.5 },
    ];
    const rows = m.budgetRows(breakdown, [
      { category_group: null, monthly_amount: '500' },
      { category_group: 'Food & Dining', monthly_amount: '200' },
    ]);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows[0], { group: 'Food & Dining', spent: 50, budget: 200, pct: 25 });
    assert.deepStrictEqual(rows[1], { group: 'Everything else', spent: 120.5, budget: 300, pct: 40.17, rest: true });
    assert.deepStrictEqual(m.budgetRows(breakdown, []), []);
    // Category budgets that exceed the overall budget leave $0 for the rest.
    const over = m.budgetRows(breakdown, [{ category_group: null, monthly_amount: 100 }, { category_group: 'Shopping', monthly_amount: 150 }]);
    assert.strictEqual(over[1].budget, 0);
    assert.strictEqual(over[1].pct, 0);
  });

  const recurring = [
    { kind: 'subscription', merchant: 'Netflix', cadence: 'monthly', averageAmount: 18.99, nextEstimate: '2026-11-12' },
    { kind: 'bill', merchant: 'Gym', cadence: 'weekly', averageAmount: 15, nextEstimate: '2026-11-09' },
    { kind: 'income', merchant: 'Employer', cadence: 'fortnightly', averageAmount: 2000, nextEstimate: '2026-11-13' },
    { kind: 'bill', merchant: 'Broken', cadence: 'sometimes', averageAmount: 9, nextEstimate: '2026-11-12' },
  ];

  await test('projectRecurring repeats by cadence inside the window', () => {
    const r = m.projectRecurring(recurring, '2026-11-08', '2026-11-21');
    assert.deepStrictEqual(r.map((x) => `${x.date} ${x.merchant}`), [
      '2026-11-09 Gym', '2026-11-12 Netflix', '2026-11-16 Gym',
    ]);
    const inc = m.projectRecurring(recurring, '2026-11-08', '2026-11-30', ['income']);
    assert.deepStrictEqual(inc.map((x) => x.date), ['2026-11-13', '2026-11-27']);
    // Monthly keeps the day of month.
    const long = m.projectRecurring([recurring[0]], '2026-11-01', '2027-01-31');
    assert.deepStrictEqual(long.map((x) => x.date), ['2026-11-12', '2026-12-12', '2027-01-12']);
  });

  await test('upcomingThisMonth sums bills due after today this month', () => {
    // After 10 Nov: Netflix 12th (18.99), Gym 16, 23, 30 (45).
    assert.strictEqual(m.upcomingThisMonth(recurring, today), 63.99);
    assert.strictEqual(m.upcomingThisMonth(recurring, new Date(2026, 10, 30)), 0);
  });

  await test('twoWeekWindow starts on Sunday', () => {
    const w = m.twoWeekWindow(today); // Tue 10 Nov 2026
    assert.strictEqual(w.length, 14);
    assert.strictEqual(m.isoDay(w[0]), '2026-11-08');
    assert.strictEqual(w[0].getDay(), 0);
    assert.strictEqual(m.isoDay(w[13]), '2026-11-21');
  });

  await test('mondayOffset', () => {
    assert.strictEqual(m.mondayOffset(2026, 10), 6); // 1 Nov 2026 is a Sunday
    assert.strictEqual(m.mondayOffset(2026, 5), 0);  // 1 Jun 2026 is a Monday
  });

  await test('monthlyCashFlow + cashFlowSummary', () => {
    const rows = m.monthlyCashFlow(txns, 2026, 10, 3, undefined);
    assert.deepStrictEqual(rows.map((r) => r.key), ['2026-09', '2026-10', '2026-11']);
    assert.deepStrictEqual(rows[0], { key: '2026-09', year: 2026, month: 8, income: 0, expenses: 60, net: -60 });
    assert.strictEqual(rows[1].income, 3912.34);
    assert.strictEqual(rows[1].expenses, 40);
    assert.strictEqual(rows[2].income, 4000);
    assert.strictEqual(rows[2].expenses, 1169.5);
    const s = m.cashFlowSummary(rows);
    assert.strictEqual(s.income, 7912.34);
    assert.strictEqual(s.expenses, 1269.5);
    assert.strictEqual(s.net, 6642.84);
    assert.strictEqual(s.avgPerMonth, 2214.28);
    assert.deepStrictEqual(m.cashFlowSummary([]), { income: 0, expenses: 0, net: 0, avgPerMonth: 0 });
  });

  await test('sankeyFlows by category with a top-N cap', () => {
    const r = m.sankeyFlows(txns, '2026-10', '2026-11', undefined);
    assert.deepStrictEqual(r.sources.map((s) => s.label), ['Salary & wages', 'Interest']);
    assert.strictEqual(r.totalIn, 7912.34);
    assert.deepStrictEqual(r.targets.map((s) => s.label), ['Shopping', 'Food & Dining', 'Auto & Transport']);
    assert.strictEqual(r.totalOut, 1209.5);
    const capped = m.sankeyFlows(txns, '2026-10', '2026-11', undefined, 'category', 1);
    assert.deepStrictEqual(capped.targets.map((s) => s.label), ['Shopping', 'Everything else']);
    assert.strictEqual(capped.targets[1].amount, 110.5);
    const pctSum = capped.targets.reduce((a, s) => a + s.pct, 0);
    assert.ok(Math.abs(pctSum - 100) < 0.02);
  });

  await test('sankeyFlows by merchant', () => {
    const r = m.sankeyFlows([
      { post_date: '2026-11-01', amount: -10, description: 'Coles', category_group: 'Food & Dining' },
      { post_date: '2026-11-02', amount: -15, description: 'Coles', category_group: 'Food & Dining' },
      { post_date: '2026-11-03', amount: 100, description: 'Employer', category_group: 'Income' },
    ], '2026-11', '2026-11', undefined, 'merchant');
    assert.deepStrictEqual(r.targets, [{ label: 'Coles', amount: 25, pct: 100 }]);
    assert.deepStrictEqual(r.sources, [{ label: 'Employer', amount: 100, pct: 100 }]);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
