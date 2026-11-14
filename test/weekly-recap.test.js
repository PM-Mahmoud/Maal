'use strict';
// Deterministic tests for lib/weekly-recap.js (Home weekly recap story) and the
// pure helpers in lib/market-brief.js.

const assert = require('assert');
const {
  buildWeeklyRecap, recapWindow, buildNetWorth, summariseFlows, buildGoals, formatRange, formatRangeLong,
} = require('../lib/weekly-recap');
const { sydneyDate, parseBriefJson, fallbackBrief, seriesFromHistory } = require('../lib/market-brief');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

// Wednesday 19 Nov 2026, 10am Sydney (= 23:00 UTC on the 18th).
const NOW = new Date('2026-11-18T23:00:00Z');

console.log('\nweekly recap — window');

test('window is the last completed Monday–Sunday week in Sydney time', () => {
  const w = recapWindow(NOW);
  assert.deepStrictEqual(w, { start: '2026-11-09', end: '2026-11-15', prevStart: '2026-11-02', prevEnd: '2026-11-08' });
});

test('on a Monday the window is the week that just ended', () => {
  const w = recapWindow(new Date('2026-11-16T01:00:00Z')); // Mon 16 Nov, 12pm Sydney
  assert.strictEqual(w.start, '2026-11-09');
  assert.strictEqual(w.end, '2026-11-15');
});

test('uses Sydney date, not UTC (Sunday UTC evening is Monday in Sydney)', () => {
  const w = recapWindow(new Date('2026-11-15T20:00:00Z')); // Mon 16 Nov 7am AEDT
  assert.strictEqual(w.end, '2026-11-15');
});

test('range labels use Australian day-first order', () => {
  assert.strictEqual(formatRange('2026-11-09', '2026-11-15'), '9–15 November');
  assert.strictEqual(formatRange('2026-10-26', '2026-11-01'), '26 Oct – 1 Nov');
  assert.strictEqual(formatRangeLong('2026-11-09', '2026-11-15'), '9th to 15th November');
  assert.strictEqual(formatRangeLong('2026-11-21', '2026-11-22'), '21st to 22nd November');
});

console.log('\nweekly recap — net worth');

const WIN = recapWindow(NOW);

test('opening = last snapshot before the window, closing = last snapshot in it', () => {
  const nw = buildNetWorth([
    { snap_date: '2026-11-05', net_worth: '90000' },
    { snap_date: '2026-11-08', net_worth: '100000' }, // opening (BIGINT-as-string)
    { snap_date: '2026-11-12', net_worth: 101000 },
    { snap_date: '2026-11-15', net_worth: 102500 }, // closing
    { snap_date: '2026-11-17', net_worth: 999999 }, // after window → ignored
  ], WIN);
  assert.strictEqual(nw.hasData, true);
  assert.strictEqual(nw.opening, 100000);
  assert.strictEqual(nw.closing, 102500);
  assert.strictEqual(nw.change, 2500);
  assert.strictEqual(nw.changePct, 2.5);
  assert.strictEqual(nw.direction, 'up');
  assert.deepStrictEqual(nw.series.map((p) => p.date), ['2026-11-08', '2026-11-12', '2026-11-15']);
});

test('accepts Date objects for snap_date (pg DATE)', () => {
  const nw = buildNetWorth([
    { snap_date: new Date('2026-11-09T00:00:00Z'), net_worth: 500 },
    { snap_date: new Date('2026-11-14T00:00:00Z'), net_worth: 400 },
  ], WIN);
  assert.strictEqual(nw.opening, 500); // falls back to first in-window snapshot
  assert.strictEqual(nw.change, -100);
  assert.strictEqual(nw.direction, 'down');
});

test('no snapshots in or before the window → hasData false, no invented numbers', () => {
  const nw = buildNetWorth([{ snap_date: '2026-11-17', net_worth: 1 }], WIN);
  assert.strictEqual(nw.hasData, false);
  assert.strictEqual(nw.change, null);
});

test('flat week reads as steady', () => {
  const r = buildWeeklyRecap({ now: NOW, snapshots: [{ snap_date: '2026-11-08', net_worth: 1072 }, { snap_date: '2026-11-15', net_worth: 1072 }] });
  assert.strictEqual(r.netWorth.direction, 'flat');
  assert.match(r.netWorth.copy.title, /steady/);
  assert.match(r.netWorth.copy.body[0], /\$1,072/);
});

console.log('\nweekly recap — spending + cash flow');

const TXNS = [
  { description: 'WOOLWORTHS 1234 SYDNEY', amount: '-120.50', post_date: '2026-11-10' }, // auto → Food & Dining
  { description: 'Coles', amount: -79.5, post_date: '2026-11-12', category_group: 'Food & Dining' },
  { description: 'AGL energy bill', amount: -210, post_date: '2026-11-13', category_group: 'Bills & Utilities' },
  { description: 'Transfer to savings', amount: -1000, post_date: '2026-11-13', category_group: 'Transfers' }, // excluded
  { description: 'VANGUARD investment', amount: -500, post_date: '2026-11-14', category_group: 'Savings & Investments' }, // excluded
  { description: 'Salary ACME', amount: 2600, post_date: '2026-11-14', category_group: 'Income' },
  { description: 'Transfer from savings', amount: 300, post_date: '2026-11-14', category_group: 'Transfers' }, // excluded
  { description: 'Last week groceries', amount: -150, post_date: '2026-11-05', category_group: 'Food & Dining' }, // prev week
  { description: 'Last week cafe', amount: -50, post_date: '2026-11-07', category_group: 'Food & Dining' }, // prev week
  { description: 'Outside both weeks', amount: -9999, post_date: '2026-10-20', category_group: 'Shopping' },
];

test('spending excludes transfers + savings and groups by category', () => {
  const f = summariseFlows(TXNS, WIN.start, WIN.end);
  assert.strictEqual(f.spent, 410);
  assert.strictEqual(f.count, 3);
  assert.strictEqual(f.income, 2600);
  assert.deepStrictEqual(f.categories.map((c) => [c.group, c.amount]), [['Bills & Utilities', 210], ['Food & Dining', 200]]);
  assert.strictEqual(f.categories[0].share, 51.22);
  assert.strictEqual(f.largest.amount, 210);
});

test('compares with the previous week', () => {
  const r = buildWeeklyRecap({ now: NOW, transactions: TXNS });
  assert.strictEqual(r.spending.total, 410);
  assert.strictEqual(r.spending.previousTotal, 200);
  assert.match(r.spending.copy.body[1], /\$210 more than the week before \(up 105\.0%\)/);
  assert.strictEqual(r.cashFlow.moneyIn, 2600);
  assert.strictEqual(r.cashFlow.moneyOut, 410);
  assert.strictEqual(r.cashFlow.net, 2190);
  assert.match(r.cashFlow.copy.body[0], /ahead by \$2,190/);
});

test('no transactions → honest empty state', () => {
  const r = buildWeeklyRecap({ now: NOW });
  assert.strictEqual(r.spending.hasData, false);
  assert.strictEqual(r.spending.total, 0);
  assert.match(r.spending.copy.title, /No spending/);
  assert.strictEqual(r.cashFlow.hasData, false);
});

console.log('\nweekly recap — goals');

test('goals sorted reached-first then by progress, capped 0–100', () => {
  const g = buildGoals([
    { name: 'Emergency fund', target_amount: '10000', current_amount: '4000', progress_pct: 40, reached: false },
    { name: 'Pay off car', target_amount: 5000, current_amount: 5000, progress_pct: 130, reached: true },
    { name: 'House deposit', target_amount: 80000, current_amount: 52000, progress_pct: 65, reached: false },
  ]);
  assert.deepStrictEqual(g.items.map((x) => x.name), ['Pay off car', 'House deposit', 'Emergency fund']);
  assert.strictEqual(g.items[0].progressPct, 100);
  assert.strictEqual(g.reached, 1);
});

console.log('\nmarket brief — pure helpers');

test('sydneyDate keys the cache by the Sydney calendar day', () => {
  assert.strictEqual(sydneyDate(new Date('2026-11-15T14:30:00Z')), '2026-11-16');
  assert.strictEqual(sydneyDate(new Date('2026-11-15T12:00:00Z')), '2026-11-15');
});

test('parseBriefJson extracts and sanitises model JSON', () => {
  const raw = 'Sure! ```json\n{"headline":"ASX edges higher as AUD firms","story":["p1","p2"],"outlook":"o","lookingAhead":[{"date":"Tuesday 2 December","title":"RBA decision","body":"b"}],"extra":1}\n```';
  const b = parseBriefJson(raw);
  assert.strictEqual(b.headline, 'ASX edges higher as AUD firms');
  assert.deepStrictEqual(b.story, ['p1', 'p2']);
  assert.strictEqual(b.lookingAhead.length, 1);
  assert.strictEqual(b.extra, undefined);
  assert.strictEqual(parseBriefJson('no json here'), null);
  assert.strictEqual(parseBriefJson('{"headline":""}'), null);
});

test('fallback brief only states figures present in the data', () => {
  const b = fallbackBrief({
    indices: [{ symbol: 'EWA', label: 'Australian shares', changePercent: 0.42 }, { symbol: 'SPY', label: 'US shares (S&P 500)', changePercent: -0.31 }],
    aud: { rate: 0.6512, changePercent: 0.1 },
    news: [{ title: 'RBA holds cash rate', source: 'abc.net.au' }],
  });
  assert.match(b.headline, /Australian shares up 0\.42%/);
  assert.match(b.story[0], /US65\.12c/);
  assert.ok(b.story.join(' ').includes('RBA holds cash rate'));
  const nulls = fallbackBrief({ indices: [{ symbol: 'EWA', label: 'Australian shares', changePercent: null }], aud: { rate: 0.68, changePercent: null }, news: [] });
  assert.ok(!/Australian shares/.test(nulls.headline), 'null % must not render as 0.00%');
  assert.match(nulls.headline, /Aussie dollar at US68\.00c/);
  const empty = fallbackBrief({ indices: [], aud: null, news: [] });
  assert.match(empty.headline, /isn’t available/);
});

test('seriesFromHistory builds an oldest→newest price series per symbol', () => {
  const s = seriesFromHistory([
    { brief_date: '2026-11-14', payload: { indices: [{ symbol: 'EWA', price: 24.1 }] } },
    { brief_date: '2026-11-12', payload: { indices: [{ symbol: 'EWA', price: 23.9 }, { symbol: 'SPY', price: null }] } },
  ], 'EWA', 24.3);
  assert.deepStrictEqual(s, [23.9, 24.1, 24.3]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
