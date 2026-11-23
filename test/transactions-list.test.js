'use strict';

// test/transactions-list.test.js
// Deterministic tests for shared/transactions-list.mjs — the Transactions list
// page's search, filters, sorting, summary totals, date presets, CSV export,
// CSV import parsing and the manual Add transaction payload.
// No DB, no network. Dates are local and fixed.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

const ROWS = [
  { id: 1, description: 'Woolworths Metro', amount: '-92.35', post_date: '2026-11-20', category_group: 'Food & Dining', category: 'Groceries', account_reference: 'basiq:cba1' },
  { id: 2, description: 'Salary — Acme Pty Ltd', amount: 3650, post_date: '2026-11-15', category_group: 'Income', category: 'Salary & wages', account_reference: 'basiq:ing1' },
  { id: 3, description: 'Netflix', amount: -18.99, post_date: '2026-11-06', category_group: 'Recurring & Subscriptions', account_reference: 'basiq:cba1' },
  { id: 4, description: 'Café Sydney', amount: -0.1, post_date: '2026-10-31T09:00:00.000Z', category_group: 'Food & Dining', category: 'Cafes' },
  { id: 5, description: 'Rent', amount: -1950, post_date: '2026-10-03', category_group: 'Housing', account_reference: 'basiq:cba1' },
  { id: 6, description: 'Refund', amount: 0.2, post_date: '2026-06-30' },
];

(async () => {
  const m = await import('../shared/transactions-list.mjs');
  console.log('\ntransactions-list');

  await test('amountOf handles strings, $ and junk', () => {
    assert.strictEqual(m.amountOf({ amount: '-92.35' }), -92.35);
    assert.strictEqual(m.amountOf({ amount: '$1,200.50' }), 1200.5);
    assert.strictEqual(m.amountOf({ amount: 'abc' }), 0);
    assert.strictEqual(m.amountOf({}), 0);
  });

  await test('accountKey falls back to manual', () => {
    assert.strictEqual(m.accountKey(ROWS[0]), 'basiq:cba1');
    assert.strictEqual(m.accountKey(ROWS[3]), 'manual');
    assert.strictEqual(m.accountKey({ account_reference: '  ' }), 'manual');
  });

  await test('detail flags are read defensively', () => {
    assert.deepStrictEqual(m.detailFlags(ROWS), { hidden: false, reviewed: false });
    assert.deepStrictEqual(m.detailFlags([{ hidden: false }, { reviewed_at: null }]), { hidden: true, reviewed: true });
    assert.strictEqual(m.isHidden({}), false);
    assert.strictEqual(m.isHidden({ is_hidden: true }), true);
    assert.strictEqual(m.isReviewed({ reviewed_at: '2026-11-01' }), true);
    assert.strictEqual(m.isReviewed({ reviewed_at: null }), false);
  });

  await test('search matches words across fields, accents and amounts', () => {
    const q = (s) => m.filterTransactions(ROWS, { query: s }).map((r) => r.id);
    assert.deepStrictEqual(q('woolworths'), [1]);
    assert.deepStrictEqual(q('cafe'), [4]); // accent-insensitive
    assert.deepStrictEqual(q('food groceries'), [1]); // every word must match
    assert.deepStrictEqual(q('18.99'), [3]);
    assert.deepStrictEqual(q('$1,950'), [5]);
    assert.deepStrictEqual(q('subscriptions'), [3]);
    assert.deepStrictEqual(q('zzz'), []);
    assert.strictEqual(q('').length, ROWS.length);
  });

  await test('filters: date range, accounts, groups, type', () => {
    const ids = (f) => m.filterTransactions(ROWS, f).map((r) => r.id);
    assert.deepStrictEqual(ids({ from: '2026-11-01', to: '2026-11-30' }), [1, 2, 3]);
    assert.deepStrictEqual(ids({ to: '2026-10-31' }), [4, 5, 6]); // timestamp day counts
    assert.deepStrictEqual(ids({ accounts: ['manual'] }), [4, 6]);
    assert.deepStrictEqual(ids({ accounts: ['basiq:ing1', 'manual'] }), [2, 4, 6]);
    assert.deepStrictEqual(ids({ groups: ['Food & Dining'] }), [1, 4]);
    assert.deepStrictEqual(ids({ groups: ['Other'] }), [6]);
    assert.deepStrictEqual(ids({ type: 'income' }), [2, 6]);
    assert.deepStrictEqual(ids({ type: 'expense' }), [1, 3, 4, 5]);
  });

  await test('amount filter uses absolute value, cent-exact', () => {
    const ids = (f) => m.filterTransactions(ROWS, f).map((r) => r.id);
    assert.deepStrictEqual(ids({ min: 18.99, max: 92.35 }), [1, 3]);
    assert.deepStrictEqual(ids({ min: 1000 }), [2, 5]);
    assert.deepStrictEqual(ids({ max: 0.2 }), [4, 6]);
  });

  await test('visibility and review filters', () => {
    const rows = [{ id: 'a', amount: -1, hidden: true }, { id: 'b', amount: -1, reviewed: true }, { id: 'c', amount: -1 }];
    const ids = (f) => m.filterTransactions(rows, f).map((r) => r.id);
    assert.deepStrictEqual(ids({ visibility: 'hidden' }), ['a']);
    assert.deepStrictEqual(ids({ visibility: 'visible' }), ['b', 'c']);
    assert.deepStrictEqual(ids({ review: 'reviewed' }), ['b']);
    assert.deepStrictEqual(ids({ review: 'unreviewed' }), ['a', 'c']);
  });

  await test('filtering never adds rows and ignores null input', () => {
    assert.deepStrictEqual(m.filterTransactions(null, {}), []);
    assert.deepStrictEqual(m.filterTransactions([null, ...ROWS], null).length, ROWS.length);
  });

  await test('activeFilterCount ignores the search box', () => {
    assert.strictEqual(m.activeFilterCount(m.emptyFilters()), 0);
    assert.strictEqual(m.activeFilterCount({ ...m.emptyFilters(), query: 'x' }), 0);
    assert.strictEqual(m.activeFilterCount({ ...m.emptyFilters(), from: '2026-01-01', to: '2026-02-01', groups: ['Housing'], min: 5, type: 'income' }), 4);
  });

  await test('sorting by date, amount, category, merchant', () => {
    assert.deepStrictEqual(m.sortTransactions(ROWS, 'date', 'desc').map((r) => r.id), [1, 2, 3, 4, 5, 6]);
    assert.deepStrictEqual(m.sortTransactions(ROWS, 'date', 'asc').map((r) => r.id), [6, 5, 4, 3, 2, 1]);
    assert.deepStrictEqual(m.sortTransactions(ROWS, 'amount', 'asc').map((r) => r.id), [5, 1, 3, 4, 6, 2]);
    assert.strictEqual(m.sortTransactions(ROWS, 'category', 'asc')[0].category_group, 'Food & Dining');
    assert.strictEqual(m.sortTransactions(ROWS, 'merchant', 'asc')[0].description, 'Café Sydney');
    assert.strictEqual(ROWS[0].id, 1); // input not mutated
  });

  await test('summary totals are cent-exact', () => {
    const s = m.summarise(ROWS);
    assert.strictEqual(s.count, 6);
    assert.strictEqual(s.from, '2026-06-30');
    assert.strictEqual(s.to, '2026-11-20');
    assert.strictEqual(s.moneyIn, 3650.2);
    assert.strictEqual(s.moneyOut, -2061.44);
    assert.strictEqual(s.net, 1588.76);
    assert.deepStrictEqual(m.summarise([]), { count: 0, from: null, to: null, moneyIn: 0, moneyOut: 0, net: 0 });
    // 0.1 + 0.2 must not drift
    assert.strictEqual(m.summarise([{ amount: 0.1 }, { amount: 0.2 }]).moneyIn, 0.3);
  });

  await test('date presets follow the AU financial year', () => {
    const today = new Date(2026, 10, 22); // 22 Nov 2026
    const p = Object.fromEntries(m.datePresets(today).map((x) => [x.id, x]));
    assert.deepStrictEqual([p['this-month'].from, p['this-month'].to], ['2026-11-01', '2026-11-22']);
    assert.deepStrictEqual([p['last-month'].from, p['last-month'].to], ['2026-10-01', '2026-10-31']);
    assert.strictEqual(p['30d'].from, '2026-10-24');
    assert.deepStrictEqual([p['this-fy'].from, p['this-fy'].to], ['2026-07-01', '2026-11-22']);
    assert.deepStrictEqual([p['last-fy'].from, p['last-fy'].to], ['2025-07-01', '2026-06-30']);
    assert.strictEqual(p['this-fy'].label, 'This financial year (FY27)');
    // Before 1 July the FY started the previous year; January rolls back a year for last month.
    const jan = Object.fromEntries(m.datePresets(new Date(2026, 0, 10)).map((x) => [x.id, x]));
    assert.strictEqual(jan['this-fy'].from, '2025-07-01');
    assert.deepStrictEqual([jan['last-month'].from, jan['last-month'].to], ['2025-12-01', '2025-12-31']);
    assert.strictEqual(m.presetFor('2026-11-01', '2026-11-22', today), 'this-month');
    assert.strictEqual(m.presetFor(null, null, today), 'all');
    assert.strictEqual(m.presetFor('2026-01-05', null, today), 'custom');
  });

  await test('fetch range defaults to the last 3 years and never exceeds the endpoint cap', () => {
    const today = new Date(2026, 10, 23); // 23 Nov 2026
    const span = (r) => (Date.UTC(+r.to.slice(0, 4), +r.to.slice(5, 7) - 1, +r.to.slice(8, 10))
      - Date.UTC(+r.from.slice(0, 4), +r.from.slice(5, 7) - 1, +r.from.slice(8, 10))) / 86400000 + 1;
    // No date filter: 3 years ending today, exactly at the 1096-day inclusive cap.
    const def = m.fetchRange(m.emptyFilters(), today);
    assert.deepStrictEqual(def, { from: '2023-11-24', to: '2026-11-23', clamped: false });
    assert.strictEqual(span(def), m.MAX_RANGE_DAYS);
    assert.strictEqual(m.datePresets(today)[0].label, 'Last 3 years');
    // A preset or custom range inside 3 years is fetched exactly.
    assert.deepStrictEqual(m.fetchRange({ from: '2025-07-01', to: '2026-06-30' }, today), { from: '2025-07-01', to: '2026-06-30', clamped: false });
    // Start only → runs to today; end only → the 3 years up to that end.
    assert.deepStrictEqual(m.fetchRange({ from: '2026-01-05', to: null }, today), { from: '2026-01-05', to: '2026-11-23', clamped: false });
    assert.deepStrictEqual(m.fetchRange({ from: null, to: '2025-02-28' }, today), { from: '2022-03-01', to: '2025-02-28', clamped: false });
    // Longer than 3 years keeps the end and is clamped.
    const long = m.fetchRange({ from: '2019-01-01', to: '2026-06-30' }, today);
    assert.deepStrictEqual(long, { from: '2023-07-01', to: '2026-06-30', clamped: true });
    assert.strictEqual(span(long), m.MAX_RANGE_DAYS);
    // Reversed dates are swapped rather than sent invalid.
    assert.deepStrictEqual(m.fetchRange({ from: '2026-06-30', to: '2026-01-01' }, today), { from: '2026-01-01', to: '2026-06-30', clamped: false });
    // Month/leap-year arithmetic.
    assert.strictEqual(m.addDays('2024-02-28', 1), '2024-02-29');
    assert.strictEqual(m.addDays('2026-01-01', -1), '2025-12-31');
  });

  await test('range validation matches the 3-year endpoint limit', () => {
    const today = new Date(2026, 10, 23);
    assert.strictEqual(m.rangeError(null, null, today), null);
    assert.strictEqual(m.rangeError(null, '2020-01-01', today), null);
    assert.strictEqual(m.rangeError('2023-11-24', '2026-11-23', today), null); // exactly 1096 days
    assert.strictEqual(m.rangeError('2023-11-23', '2026-11-23', today), 'Choose a range of up to 3 years.');
    assert.strictEqual(m.rangeError('2023-11-23', null, today), 'Choose a range of up to 3 years.'); // end defaults to today
    assert.strictEqual(m.rangeError('2026-02-01', '2026-01-01', today), 'The start date is after the end date.');
  });

  await test('CSV cells are quoted and guarded against formula injection', () => {
    assert.strictEqual(m.csvCell('plain'), 'plain');
    assert.strictEqual(m.csvCell('a, b'), '"a, b"');
    assert.strictEqual(m.csvCell('say "hi"'), '"say ""hi"""');
    assert.strictEqual(m.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.strictEqual(m.csvCell('+61 400'), "'+61 400");
    assert.strictEqual(m.csvCell('-12.00', { text: false }), '-12.00');
    assert.strictEqual(m.csvCell(null), '');
  });

  await test('CSV export contains exactly the given rows', () => {
    const rows = m.filterTransactions(ROWS, { groups: ['Food & Dining'] });
    const csv = m.transactionsToCsv(rows, { accountLabel: (t) => (t.account_reference ? 'CommBank ••cba1' : 'Manual entry') });
    assert.ok(csv.startsWith('﻿'));
    const lines = csv.slice(1).trimEnd().split('\r\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(lines[0], 'Date,Description,Category group,Category,Account,Type,Amount (AUD)');
    assert.strictEqual(lines[1], '2026-11-20,Woolworths Metro,Food & Dining,Groceries,CommBank ••cba1,Money out,-92.35');
    assert.strictEqual(lines[2], '2026-10-31,Café Sydney,Food & Dining,Cafes,Manual entry,Money out,-0.10');
  });

  await test('CSV export adds Hidden/Reviewed only when the data has them', () => {
    const csv = m.transactionsToCsv([{ description: 'x', amount: 5, post_date: '2026-01-01', hidden: true }], { flags: { hidden: true, reviewed: true } });
    const lines = csv.slice(1).trimEnd().split('\r\n');
    assert.ok(lines[0].endsWith('Hidden,Reviewed'));
    assert.ok(lines[1].endsWith('Money in,5.00,Yes,No'));
  });

  await test('export filename reflects the date filter', () => {
    const today = new Date(2026, 10, 22);
    assert.strictEqual(m.exportFilename({}, today), 'maal-transactions-2026-11-22.csv');
    assert.strictEqual(m.exportFilename({ from: '2026-07-01' }, today), 'maal-transactions-2026-07-01-to-2026-11-22.csv');
  });

  await test('import: parses quoted CSV, AU dates and accounting negatives', () => {
    const text = '﻿Date,Description,Amount\r\n22/11/2026,"Coles, Bondi",(45.10)\r\n2026-11-01,Pay,3650\n03/11/2026,Card,12.50 CR\n\nClosing balance\n';
    const r = m.parseStatementCsv(text);
    assert.deepStrictEqual(r.rows, [
      { occurred_on: '2026-11-22', description: 'Coles, Bondi', amount: -45.1 },
      { occurred_on: '2026-11-01', description: 'Pay', amount: 3650 },
      { occurred_on: '2026-11-03', description: 'Card', amount: -12.5 },
    ]);
  });

  await test('import: all-or-nothing errors name the row', () => {
    assert.match(m.parseStatementCsv('Date,Description,Amount\n31/02/2026,X,1\n').error, /^Row 2: couldn’t read the date/);
    assert.match(m.parseStatementCsv('2026-01-01,,1\n').error, /^Row 1: missing a description/);
    assert.match(m.parseStatementCsv('2026-01-01,X,abc\n').error, /^Row 1: couldn’t read the amount/);
    assert.match(m.parseStatementCsv('').error, /No valid rows/);
    assert.strictEqual(m.rowFingerprint({ occurred_on: '2026-01-01', description: ' Coles ', amount: -5 }), '2026-01-01|coles|-5.00');
  });

  await test('manual add: signs the amount by type and validates', () => {
    const today = new Date(2026, 10, 22);
    const ok = m.buildManualTransaction({ type: 'expense', description: '  Bakery   Bondi ', amount: '$1,234.5', date: '2026-11-21', group: 'Food & Dining', category: 'Cafes' }, today);
    assert.deepStrictEqual(ok, { ok: true, body: { occurred_on: '2026-11-21', description: 'Bakery Bondi', amount: -1234.5 }, category: { group: 'Food & Dining', category: 'Cafes' } });
    const inc = m.buildManualTransaction({ type: 'income', description: 'Side gig', amount: '0.10', date: '22/11/2026' }, today);
    assert.deepStrictEqual(inc, { ok: true, body: { occurred_on: '2026-11-22', description: 'Side gig', amount: 0.1 }, category: null });
    const bad = m.buildManualTransaction({ type: 'expense', description: '', amount: '-5', date: '2026-11-23' }, today);
    assert.strictEqual(bad.ok, false);
    assert.deepStrictEqual(Object.keys(bad.errors).sort(), ['amount', 'date', 'description']);
    assert.strictEqual(m.buildManualTransaction({ description: 'x', amount: '0', date: '2026-11-01' }, today).errors.amount, 'The amount must be more than $0.00.');
    assert.ok(m.buildManualTransaction({ description: 'x', amount: '1.234', date: '2026-11-01' }, today).errors.amount);
    assert.ok(m.buildManualTransaction({ description: 'x', amount: '20000000', date: '2026-11-01' }, today).errors.amount);
    assert.ok(m.buildManualTransaction({ description: 'x'.repeat(161), amount: '1', date: '2026-11-01' }, today).errors.description);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
