'use strict';

// test/home-accounts.test.js
// Deterministic tests for shared/home-accounts.mjs — the Home dashboard's
// account filter, headline total, filtered net-worth series, range change and
// monthly spending calendar. Per CLAUDE.md, financial calculations are tested.
// No DB, no network.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const m = await import('../shared/home-accounts.mjs');
  console.log('\nhome-accounts');

  // BIGINT columns arrive as strings — the fixture mirrors that.
  const rows = {
    cash: [
      { id: 1, label: 'Everyday', institution: 'CommBank', balance: '2000', account_reference: '062000123456' },
      { id: 2, label: 'Saver', institution: 'ING', balance: '8000' },
    ],
    investments: [{ id: 3, name: 'VDHG', value: '5000' }],
    super: [{ id: 4, label: 'Super', fund_name: 'AustralianSuper', balance: '40000' }],
    properties: [{ id: 5, label: 'Home', value: '600000', mortgage_balance: '450000' }],
    debts: [{ id: 6, label: 'HECS', balance: '20000' }],
    other: [{ id: 7, label: 'Car', value: '15000' }],
  };
  const accounts = m.buildHomeAccounts(rows);

  await test('buildHomeAccounts coerces BIGINT strings and signs debts', () => {
    assert.strictEqual(accounts.length, 7);
    const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
    assert.strictEqual(byId['cash:1'].balance, 2000);
    assert.strictEqual(byId['cash:1'].reference, '3456');
    assert.strictEqual(byId['cash:1'].institution, 'CommBank');
    assert.strictEqual(byId['super:4'].name, 'AustralianSuper');
    assert.strictEqual(byId['property:5'].balance, 150000);
    assert.strictEqual(byId['debt:6'].balance, -20000);
  });

  await test('filteredTotals with no filter sums every account', () => {
    const t = m.filteredTotals(accounts, null);
    assert.strictEqual(t.cash, 10000);
    assert.strictEqual(t.investments, 5000);
    assert.strictEqual(t.super, 40000);
    assert.strictEqual(t.other, 615000);
    assert.strictEqual(t.debts, 470000);
    assert.strictEqual(t.netWorth, 10000 + 5000 + 40000 + 615000 - 470000);
  });

  await test('filteredTotals honours the selection', () => {
    const t = m.filteredTotals(accounts, ['cash:1', 'debt:6']);
    assert.strictEqual(t.netWorth, 2000 - 20000);
    assert.strictEqual(m.filteredTotals(accounts, []).netWorth, 0);
  });

  await test('isPartialSelection', () => {
    assert.strictEqual(m.isPartialSelection(accounts, null), false);
    assert.strictEqual(m.isPartialSelection(accounts, accounts.map((a) => a.id)), false);
    assert.strictEqual(m.isPartialSelection(accounts, ['cash:1']), true);
  });

  const snapshots = [
    { date: '2026-11-01', netWorth: 180000, assets: 650000, cash: 8000, investments: 4000, super: 38000, debts: 470000 },
    { date: '2026-11-15', netWorth: 200000, assets: 670000, cash: 10000, investments: 5000, super: 40000, debts: 470000 },
  ];

  await test('filteredSeries with all accounts equals recorded net worth exactly', () => {
    const s = m.filteredSeries(snapshots, accounts, null);
    assert.deepStrictEqual(s.map((p) => p.value), [180000, 200000]);
    const s2 = m.filteredSeries(snapshots, accounts, accounts.map((a) => a.id));
    assert.deepStrictEqual(s2.map((p) => p.value), [180000, 200000]);
  });

  await test('filteredSeries scales partially selected categories by current share', () => {
    // Only the CommBank account (2000 of 10000 cash = 20%).
    const s = m.filteredSeries(snapshots, accounts, ['cash:1']);
    assert.deepStrictEqual(s.map((p) => p.value), [1600, 2000]);
    // The latest point always lands on the headline total.
    assert.strictEqual(s[s.length - 1].value, m.filteredTotals(accounts, ['cash:1']).netWorth);
  });

  await test('filteredSeries includes whole categories that are fully selected', () => {
    const sel = ['cash:1', 'cash:2', 'super:4'];
    const s = m.filteredSeries(snapshots, accounts, sel);
    assert.deepStrictEqual(s.map((p) => p.value), [8000 + 38000, 10000 + 40000]);
  });

  await test('rangeStart / sliceSeries', () => {
    const now = new Date(2026, 10, 15);
    assert.strictEqual(m.rangeStart('1W', now), '2026-11-08');
    assert.strictEqual(m.rangeStart('1M', now), '2026-10-15');
    assert.strictEqual(m.rangeStart('3M', now), '2026-08-15');
    assert.strictEqual(m.rangeStart('YTD', now), '2026-01-01');
    assert.strictEqual(m.rangeStart('ALL', now), null);
    const series = [{ date: '2026-01-01', value: 1 }, { date: '2026-11-10', value: 2 }, { date: '2026-11-15', value: 3 }];
    assert.deepStrictEqual(m.sliceSeries(series, '1W', now).map((p) => p.value), [2, 3]);
    assert.strictEqual(m.sliceSeries(series, 'ALL', now).length, 3);
  });

  await test('seriesChange: amount and percent, null pct when not comparable', () => {
    assert.deepStrictEqual(m.seriesChange([{ value: 1000 }, { value: 2074.51 }]), { change: 1074.51, pct: 107.45 });
    assert.deepStrictEqual(m.seriesChange([{ value: -1000 }, { value: -500 }]), { change: 500, pct: 50 });
    assert.deepStrictEqual(m.seriesChange([{ value: 0 }, { value: 50 }]), { change: 50, pct: null });
    assert.deepStrictEqual(m.seriesChange([{ value: 5 }]), { change: 0, pct: null });
    assert.deepStrictEqual(m.seriesChange([]), { change: 0, pct: null });
  });

  await test('monthSpending: sums money out per day, skips income/transfers/other months', () => {
    const txns = [
      { post_date: '2026-11-02', amount: '-100' },
      { post_date: '2026-11-02T10:00:00Z', amount: -20.5 },
      { post_date: '2026-11-03', amount: '2500' },                      // income
      { post_date: '2026-11-04', amount: -300, category: 'Transfers' },  // transfer
      { post_date: '2026-11-05', amount: -40, category_group: 'transfers' }, // transfer group
      { post_date: '2026-11-06', amount: -60, relationship_type: 'internal_transfer' },
      { post_date: '2026-10-31', amount: -999 },                         // last month
      { amount: -5 },                                                    // no date
    ];
    const r = m.monthSpending(txns, 2026, 10, new Date(2026, 10, 15));
    assert.strictEqual(r.total, 120.5);
    assert.strictEqual(r.byDay.length, 30);
    assert.strictEqual(r.byDay[1], 120.5);
    assert.strictEqual(r.byDay[0], 0);
    assert.strictEqual(r.byDay[14], 0);   // today
    assert.strictEqual(r.byDay[15], null); // future day
  });

  await test('monthSpending: past month has no future days', () => {
    const r = m.monthSpending([], 2026, 1, new Date(2026, 10, 15));
    assert.strictEqual(r.byDay.length, 28);
    assert.ok(r.byDay.every((v) => v === 0));
  });

  await test('holdingReturn: gain and pct of cost; null without cost basis', () => {
    assert.deepStrictEqual(m.holdingReturn('5000', '4000'), { gain: 1000, pct: 25 });
    assert.deepStrictEqual(m.holdingReturn(900, 1000), { gain: -100, pct: -10 });
    assert.deepStrictEqual(m.holdingReturn(900, 0), { gain: null, pct: null });
    assert.deepStrictEqual(m.holdingReturn(900, null), { gain: null, pct: null });
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
