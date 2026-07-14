'use strict';
// Deterministic tests for lib/digest.js — the daily portfolio digest model.

const assert = require('assert');
const { buildDigestModel, netWorthDaysAgo } = require('../lib/digest');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

function day(n) { // n days ago from a fixed anchor
  return new Date(Date.UTC(2026, 6, 14) - n * 86400000).toISOString().slice(0, 10);
}

console.log('\ndaily digest model');

const snap = { netWorth: 260000, cashBalance: 24000, investBalance: 60000, superBalance: 90000, debtsTotal: 40000 };
const maal = { hasData: true, score: 68, band: 'Building' };
const history = [
  { snap_date: day(7), net_worth: 250000 },
  { snap_date: day(3), net_worth: 255000 },
  { snap_date: day(0), net_worth: 260000 },
];

test('computes net worth, week change ($ and %), and direction', () => {
  const m = buildDigestModel({ snap, maal, snapshots: history, profile: { monthly_expenses: 4000 } });
  assert.strictEqual(m.netWorth, 260000);
  assert.strictEqual(m.weekChangeAbs, 10000);   // 260k - 250k (~7d ago)
  assert.strictEqual(m.weekChangePct, 4);       // 10k / 250k
  assert.strictEqual(m.direction, 'up');
});

test('cash runway = cash / monthly expenses', () => {
  const m = buildDigestModel({ snap, maal, snapshots: history, profile: { monthly_expenses: 4000 } });
  assert.strictEqual(m.runwayMonths, 6); // 24000 / 4000
});

test('no expenses → runway null (no divide-by-zero)', () => {
  const m = buildDigestModel({ snap, maal, snapshots: history, profile: {} });
  assert.strictEqual(m.runwayMonths, null);
});

test('no history → week change null, direction flat', () => {
  const m = buildDigestModel({ snap, maal, snapshots: [], profile: {} });
  assert.strictEqual(m.weekChangeAbs, null);
  assert.strictEqual(m.weekChangePct, null);
  assert.strictEqual(m.direction, 'flat');
});

test('falling net worth → down direction, negative change', () => {
  const falling = [
    { snap_date: day(7), net_worth: 300000 },
    { snap_date: day(0), net_worth: 280000 },
  ];
  const m = buildDigestModel({ snap: { ...snap, netWorth: 280000 }, maal, snapshots: falling, profile: {} });
  assert.strictEqual(m.weekChangeAbs, -20000);
  assert.strictEqual(m.direction, 'down');
});

test('score/band only surfaced when maal has data', () => {
  const m = buildDigestModel({ snap, maal: { hasData: false }, snapshots: history, profile: {} });
  assert.strictEqual(m.score, null);
  assert.strictEqual(m.band, null);
});

test('netWorthDaysAgo picks the closest snapshot to the target window', () => {
  assert.strictEqual(netWorthDaysAgo(history, 7), 250000);
  assert.strictEqual(netWorthDaysAgo([], 7), null);
});

test('degrades to 0 on missing snap fields, never NaN', () => {
  const m = buildDigestModel({});
  assert.strictEqual(m.netWorth, 0);
  assert.ok(m.weekChangeAbs === null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
