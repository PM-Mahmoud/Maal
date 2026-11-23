'use strict';

// test/spending-breakdown.test.js
// Deterministic tests for Session 2 "Breakdown & budget" (HEL-84..HEL-90):
//  - shared/spending-breakdown.mjs  (category table, group roll-up, income,
//    cash flow, largest/frequent, category history + averages, savings
//    target, available budget, budget suggestion, potential savings)
//  - lib/spending-categories.js     (custom category / group validation, merge)
//  - lib/budget-wording.js          (model wording may never add a number)
// No DB, no network. Dates are local and fixed.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.stack || e.message}`); failed++; }
}

const t = (post_date, amount, category_group, extra = {}) => ({ post_date, amount, category_group, description: extra.description || category_group, ...extra });

(async () => {
  const m = await import('../shared/spending-breakdown.mjs');
  const cats = require('../lib/spending-categories');
  const words = require('../lib/budget-wording');
  console.log('\nspending-breakdown');

  // Nov 2026 is "this month"; Aug–Oct are the complete months before it.
  const today = new Date(2026, 10, 20);
  const txns = [
    t('2026-11-03', -100, 'Food & Dining'),
    t('2026-11-04', '-50.50', 'Shopping'),
    t('2026-11-05', -20, 'Food & Dining'),
    t('2026-11-06', 3000, 'Income', { category: 'Salary & wages' }),
    t('2026-11-07', -400, 'Transfers'),
    t('2026-11-08', -60, 'Pets'),
    t('2026-10-03', -80, 'Food & Dining'),
    t('2026-10-04', -200, 'Shopping'),
    t('2026-10-06', 3000, 'Income', { category: 'Salary & wages' }),
    t('2026-10-07', 40, 'Shopping', { description: 'Refund' }),
  ];

  await test('monthKey / firstDataKey', () => {
    assert.strictEqual(m.monthKey(2026, 0), '2026-01');
    assert.strictEqual(m.firstDataKey(txns), '2026-10');
    assert.strictEqual(m.firstDataKey([]), null);
  });

  await test('breakdownTable: amounts, share, change vs last month, $0 includes', () => {
    const rows = m.breakdownTable(txns, 2026, 10, undefined, ['Housing']);
    assert.deepStrictEqual(rows.map((r) => r.group), ['Food & Dining', 'Pets', 'Shopping', 'Housing']);
    const food = rows[0];
    assert.strictEqual(food.amount, 120);
    assert.strictEqual(food.prev, 80);
    assert.strictEqual(food.change, 50);
    assert.strictEqual(rows[1].change, null); // new this month
    assert.strictEqual(rows[2].change, -74.75); // 50.50 vs 200
    assert.deepStrictEqual(rows[3], { group: 'Housing', amount: 0, pct: 0, prev: 0, change: 0 });
    assert.strictEqual(Math.round(rows.reduce((a, r) => a + r.pct, 0)), 100);
  });

  await test('groupRollup: groups sum their members, the rest is Ungrouped, empty groups kept', () => {
    const rows = m.breakdownTable(txns, 2026, 10, undefined);
    const g = m.groupRollup(rows, [{ name: 'Fun', categories: ['Shopping', 'Pets'] }, { name: 'Empty', categories: ['Housing'] }]);
    assert.deepStrictEqual(g.map((x) => [x.group, x.amount]), [['Ungrouped', 120], ['Fun', 110.5], ['Empty', 0]]);
    assert.strictEqual(Math.round(g[0].pct + g[1].pct), 100);
  });

  await test('incomeTable: by sub-category, custom income categories, refunds are Other income', () => {
    const extra = [...txns, t('2026-11-10', 250, 'Side hustle'), t('2026-11-11', 15, 'Shopping')];
    const rows = m.incomeTable(extra, 2026, 10, ['Side hustle']);
    assert.deepStrictEqual(rows.map((r) => [r.group, r.amount]), [['Salary & wages', 3000], ['Side hustle', 250], ['Other income', 15]]);
  });

  await test('monthCashFlow ignores transfers and follows excluded groups', () => {
    assert.deepStrictEqual(m.monthCashFlow(txns, 2026, 10), { income: 3000, expenses: 230.5, net: 2769.5 });
    assert.strictEqual(m.monthCashFlow(txns, 2026, 10, ['Income', 'Transfers', 'Credit Card Payments', 'Pets']).expenses, 170.5);
  });

  await test('largestExpenses + frequentExpenses', () => {
    const big = m.largestExpenses(txns, 2026, 10, undefined, 2);
    assert.deepStrictEqual(big.map((x) => x.spend), [100, 60]);
    const freq = m.frequentExpenses([...txns, t('2026-11-12', -9, 'Food & Dining', { description: 'Cafe' }), t('2026-11-13', -11, 'Food & Dining', { description: 'Cafe' })], 2026, 10);
    assert.deepStrictEqual(freq, [{ merchant: 'Food & Dining', count: 2, total: 120, group: 'Food & Dining' }, { merchant: 'Cafe', count: 2, total: 20, group: 'Food & Dining' }]);
  });

  await test('withAvailable adds budget − spent', () => {
    assert.deepStrictEqual(m.withAvailable([{ group: 'A', spent: 72, budget: 100 }])[0].available, 28);
    assert.strictEqual(m.withAvailable([{ group: 'A', spent: 120.4, budget: 100 }])[0].available, -20.4);
  });

  await test('categoryHistory + historyStats (complete months since first data only)', () => {
    const h = m.categoryHistory(txns, 'Food & Dining', 2026, 10, 6, undefined);
    assert.strictEqual(h.length, 6);
    assert.deepStrictEqual(h.slice(-2).map((x) => x.amount), [80, 120]);
    const s = m.historyStats(h, '2026-11', '2026-10');
    assert.deepStrictEqual(s, { lastMonth: 80, average: 80, months: 1 });
    assert.deepStrictEqual(m.historyStats([], '2026-11', null), { lastMonth: 0, average: 0, months: 0 });
  });

  await test('averageMonthlyIncome / savingsTarget / availableForCategory', () => {
    assert.strictEqual(m.averageMonthlyIncome(txns, today, 3), 3040); // Oct only (first data month)
    assert.deepStrictEqual(m.savingsTarget(3000, 2750), { savings: 250, pctOfIncome: 8.33 });
    assert.deepStrictEqual(m.savingsTarget(0, 275), { savings: -275, pctOfIncome: null });
    const b = [{ category_group: null, monthly_amount: '275' }, { category_group: 'Shopping', monthly_amount: 100 }, { category_group: 'Groceries', monthly_amount: '75.50' }];
    assert.strictEqual(m.availableForCategory(b, 'Entertainment'), 99.5);
    assert.strictEqual(m.availableForCategory(b, 'Shopping'), 199.5);
    assert.strictEqual(m.availableForCategory(b.slice(1), 'Shopping'), null);
  });

  // Three steady months: income 5000, spend 4500 (rent 2000, food 1500, fun 1000).
  const steady = [];
  for (const mo of ['08', '09', '10']) {
    steady.push(t(`2026-${mo}-01`, 5000, 'Income', { category: 'Salary & wages' }));
    steady.push(t(`2026-${mo}-02`, -2000, 'Housing'));
    steady.push(t(`2026-${mo}-03`, -1000, 'Food & Dining'), t(`2026-${mo}-13`, -500, 'Food & Dining'));
    steady.push(t(`2026-${mo}-04`, -1000, 'Travel & Lifestyle'));
  }

  await test('suggestBudget: trims towards 80% of income, capped at a 15% cut, $10 rounding', () => {
    const s = m.suggestBudget(steady, today);
    assert.strictEqual(s.enoughData, true);
    assert.strictEqual(s.monthsUsed, 3);
    assert.strictEqual(s.avgIncome, 5000);
    assert.strictEqual(s.avgExpenses, 4500);
    assert.strictEqual(s.avgSavings, 500);
    // max(4500 × 0.85 = 3825, 5000 × 0.8 = 4000) = 4000
    assert.strictEqual(s.suggested, 4000);
    assert.deepStrictEqual(s.range, { min: 3200, max: 4800 });
    assert.strictEqual(s.slider.step, 10);
    const sum = s.categories.reduce((a, c) => a + c.budget, 0);
    assert.ok(sum <= s.suggested, 'category budgets fit inside the monthly budget');
    assert.deepStrictEqual(s.categories[0], { group: 'Housing', average: 2000, budget: 1780 });
    assert.deepStrictEqual(s.facts.find((f) => f.id === 'top_category'), { id: 'top_category', category: 'Housing', average: 2000, share: 44.44 });
    assert.ok(s.facts.some((f) => f.id === 'saving' && f.rate === 10));
  });

  await test('suggestBudget: already saving 20%+ keeps spending where it is', () => {
    const rich = steady.map((x) => (x.category_group === 'Income' ? { ...x, amount: 8000 } : x));
    assert.strictEqual(m.suggestBudget(rich, today).suggested, 4500);
    // Rounding to $10 never lifts it above typical spend ($3,296 → $3,290, not $3,300).
    const odd = [];
    for (const mo of ['08', '09', '10']) {
      odd.push(t(`2026-${mo}-01`, 8000, 'Income', { category: 'Salary & wages' }));
      for (let i = 1; i <= 4; i++) odd.push(t(`2026-${mo}-1${i}`, -824, 'Housing'));
    }
    const s = m.suggestBudget(odd, today);
    assert.strictEqual(s.avgExpenses, 3296);
    assert.strictEqual(s.suggested, 3290);
  });

  await test('suggestBudget: no income trims typical spend by 15%; negative cash flow flagged', () => {
    const none = steady.filter((x) => x.category_group !== 'Income');
    const s = m.suggestBudget(none, today);
    assert.strictEqual(s.suggested, 3830); // 4500 × 0.85 = 3825 → 3830
    assert.ok(s.facts.some((f) => f.id === 'no_income'));
    const tight = steady.map((x) => (x.category_group === 'Income' ? { ...x, amount: 4000 } : x));
    const s2 = m.suggestBudget(tight, today);
    assert.strictEqual(s2.suggested, 3830); // max(3825, 3200) → 3830
    assert.deepStrictEqual(s2.facts.find((f) => f.id === 'negative_cash_flow'), { id: 'negative_cash_flow', months: 3, negativeMonths: 3, shortfall: 500 });
  });

  await test('suggestBudget: not enough data → enoughData false, no figures', () => {
    const s = m.suggestBudget(txns.filter((x) => x.post_date.startsWith('2026-11')), today);
    assert.strictEqual(s.enoughData, false);
    assert.strictEqual(s.suggested, 0);
    assert.strictEqual(m.suggestBudget([], today).enoughData, false);
  });

  await test('potentialSavings: tone + figures', () => {
    assert.deepStrictEqual(m.potentialSavings(4000, 5000, 4500), { budget: 4000, monthlySaving: 1000, overIncome: 0, vsTypical: 500, tone: 'good' });
    assert.deepStrictEqual(m.potentialSavings(310, 0, 326), { budget: 310, monthlySaving: null, overIncome: 0, vsTypical: 16, tone: 'good' });
    assert.strictEqual(m.potentialSavings(5200, 5000, 4500).tone, 'warn');
    assert.strictEqual(m.potentialSavings(5200, 5000, 4500).overIncome, 200);
    assert.strictEqual(m.potentialSavings(4600, 0, 4500).tone, 'warn');
  });

  console.log('\nspending-categories');

  await test('validateCategoryInput: name rules, clashes with built-ins and own names, whitelists', () => {
    const ok = cats.validateCategoryInput({ name: '  Pet   care ', color: cats.COLORS[0], icon: 'dog' }, ['Gym']);
    assert.deepStrictEqual(ok, { category: { name: 'Pet care', kind: 'expense', color: cats.COLORS[0], icon: 'dog' } });
    assert.ok(cats.validateCategoryInput({ name: 'shopping', color: cats.COLORS[0], icon: 'dog' }).error);
    assert.ok(cats.validateCategoryInput({ name: 'GYM', color: cats.COLORS[0], icon: 'dog' }, ['Gym']).error);
    assert.ok(cats.validateCategoryInput({ name: 'x'.repeat(41), color: cats.COLORS[0], icon: 'dog' }).error);
    assert.ok(cats.validateCategoryInput({ name: 'A', color: 'red', icon: 'dog' }).error);
    assert.ok(cats.validateCategoryInput({ name: 'A', color: cats.COLORS[0], icon: '<svg>' }).error);
    assert.ok(cats.validateCategoryInput({ name: 'A', kind: 'transfer', color: cats.COLORS[0], icon: 'dog' }).error);
    // Partial edit keeps its own name without a clash.
    assert.deepStrictEqual(cats.validateCategoryInput({ name: 'Gym' }, ['Gym'], { partial: true, currentName: 'Gym' }), { category: { name: 'Gym' } });
    assert.ok(cats.validateCategoryInput({}, [], { partial: true }).error);
  });

  await test('validateGroupInput: known categories only, de-duplicated', () => {
    const g = cats.validateGroupInput({ name: 'Fun', color: cats.COLORS[1], categories: ['Shopping', 'Pets', 'Shopping'] }, ['Shopping', 'Pets']);
    assert.deepStrictEqual(g, { group: { name: 'Fun', kind: 'expense', color: cats.COLORS[1], categories: ['Shopping', 'Pets'] } });
    assert.ok(cats.validateGroupInput({ name: 'Fun', color: cats.COLORS[1], categories: ['Nope'] }, ['Shopping']).error);
    assert.ok(cats.validateGroupInput({ name: 'fun', color: cats.COLORS[1] }, [], ['Fun']).error);
  });

  await test('mergeTaxonomy appends custom categories as top-level groups; isAssignableCategory', () => {
    const list = cats.mergeTaxonomy([{ id: 7, name: 'Pets', kind: 'expense', color: '#121313', icon: 'dog' }]);
    assert.strictEqual(list.length, 19);
    assert.deepStrictEqual(list[18], { group: 'Pets', categories: [], custom: true, id: '7', kind: 'expense', color: '#121313', icon: 'dog' });
    assert.deepStrictEqual(list[0], { group: 'Income', categories: ['Salary & wages', 'Interest', 'Dividends', 'Refunds', 'Other income'] });
    assert.strictEqual(cats.isAssignableCategory('Pets', null, ['Pets']), true);
    assert.strictEqual(cats.isAssignableCategory('Pets', 'Vet', ['Pets']), false);
    assert.strictEqual(cats.isAssignableCategory('Pets', null, []), false);
  });

  await test('toGroups shapes rows + members', () => {
    const g = cats.toGroups([{ id: 1, name: 'Fun', kind: 'expense', color: '#121313' }], [{ group_id: '1', category_name: 'Shopping' }, { group_id: 1, category_name: 'Pets' }, { group_id: 9, category_name: 'X' }]);
    assert.deepStrictEqual(g, [{ id: '1', name: 'Fun', kind: 'expense', color: '#121313', categories: ['Pets', 'Shopping'] }]);
  });

  await test('bulk-edit + custom categories: accepted only when they are the user\'s and carry no sub-category', () => {
    const d = require('../lib/transaction-detail');
    assert.deepStrictEqual(d.validateBulkEdit({ ids: [1], changes: { category: { category_group: 'Pets' } } }, ['Pets']).changes, { category: { category_group: 'Pets', category: null } });
    assert.ok(d.validateBulkEdit({ ids: [1], changes: { category: { category_group: 'Pets' } } }).error);
    assert.ok(d.validateBulkEdit({ ids: [1], changes: { category: { category_group: 'Pets', category: 'Vet' } } }, ['Pets']).error);
    assert.deepStrictEqual(d.validateBulkEdit({ ids: [1], changes: { category: { category_group: 'Shopping' } } }).changes.category, { category_group: 'Shopping', category: null });
  });

  console.log('\nbudget-wording');
  const s = m.suggestBudget(steady, today);
  const allowed = m.allowedFigures(s);

  await test('prompt carries computed figures only (no merchant names)', () => {
    const msgs = words.buildMessages(s);
    assert.strictEqual(msgs.length, 2);
    assert.ok(msgs[1].content.includes('Suggested monthly budget: $4,000'));
    assert.ok(!/Woolworths|Coles/.test(msgs[1].content));
  });

  await test('parseWording drops any sentence with a number that was not computed', () => {
    const raw = 'Sure! {"summary": "You usually spend $4,500 a month. You could save $9,999 by Christmas.", "why": ["A $4,000 budget keeps 20% of income free.", "Cutting 37% is easy.", "Small steps stick."]}';
    const w = words.parseWording(raw, allowed);
    assert.deepStrictEqual(w, { summary: 'You usually spend $4,500 a month.', why: ['A $4,000 budget keeps 20% of income free.', 'Small steps stick.'] });
  });

  await test('parseWording: junk or all-invented replies give null', () => {
    assert.strictEqual(words.parseWording('no json here', allowed), null);
    assert.strictEqual(words.parseWording('{"summary": "Save $123,456."}', allowed), null);
    assert.strictEqual(words.parseWording(null, allowed), null);
  });

  console.log(`\nspending-breakdown: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
