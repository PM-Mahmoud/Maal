'use strict';
// Deterministic tests for lib/radar-logic.js — radar readiness scoring +
// scheduling (isRadarDue). Scheduling uses fixed AEST (UTC+10); all `now` values
// below are explicit UTC instants so the local-time math is reproducible.

const assert = require('assert');
const { computeRadarReadiness, isRadarDue, parseHHMM } = require('../lib/radar-logic');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

// A UTC instant that is 10:00 AEST on the given Y-M-D (AEST = UTC+10 → 00:00 UTC).
function aest(y, m, d, hh = 10, mm = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh - 10, mm)).toISOString();
}

console.log('\nradar readiness');

test('empty profile → 0% ready, all checks missing', () => {
  const r = computeRadarReadiness({});
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.ready, false);
  assert.strictEqual(r.missing.length, 5);
});

test('full profile → 100% ready, nothing missing', () => {
  const r = computeRadarReadiness({
    annual_income: 90000, super_balance: 50000, investment_portfolio: 20000,
    cash_savings: 15000, monthly_expenses: 4000, total_debt: 10000,
  });
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.ready, true);
  assert.deepStrictEqual(r.missing, []);
});

test('partial profile scores proportionally and lists what is missing', () => {
  const r = computeRadarReadiness({ annual_income: 90000, super_balance: 50000 });
  assert.strictEqual(r.score, 40); // 2 of 5
  assert.ok(r.missing.some((m) => m.key === 'cash'));
  assert.ok(r.missing.some((m) => m.key === 'debt'));
});

test('no_debt flag satisfies the debt check', () => {
  const r = computeRadarReadiness({ no_debt: true });
  assert.ok(!r.missing.some((m) => m.key === 'debt'));
});

console.log('\nradar scheduling (isRadarDue, AEST)');

test('parseHHMM parses and defaults to 09:00', () => {
  assert.strictEqual(parseHHMM('07:30'), 450);
  assert.strictEqual(parseHHMM('bad'), 540);
  assert.strictEqual(parseHHMM(''), 540);
});

test('inactive radar is never due', () => {
  assert.strictEqual(isRadarDue({ active: false, frequency: 'daily' }, aest(2026, 7, 14)), false);
});

test('daily: due once per day, only after the send time', () => {
  const r = { frequency: 'daily', time_aest: '09:00', last_run_at: null };
  assert.strictEqual(isRadarDue(r, aest(2026, 7, 14, 8, 0)), false); // before 09:00
  assert.strictEqual(isRadarDue(r, aest(2026, 7, 14, 9, 0)), true);  // at 09:00
  // Already ran this morning → not due again today.
  const ran = { ...r, last_run_at: aest(2026, 7, 14, 9, 5) };
  assert.strictEqual(isRadarDue(ran, aest(2026, 7, 14, 15, 0)), false);
  // Next day → due again.
  assert.strictEqual(isRadarDue(ran, aest(2026, 7, 15, 9, 0)), true);
});

test('weekly with a fixed schedule_day fires only on that weekday', () => {
  // 2026-07-14 is a Tuesday (dow 2).
  const tue = { frequency: 'weekly', schedule_day: 2, time_aest: '09:00', last_run_at: null };
  assert.strictEqual(isRadarDue(tue, aest(2026, 7, 14, 9, 0)), true);  // Tuesday
  assert.strictEqual(isRadarDue(tue, aest(2026, 7, 15, 9, 0)), false); // Wednesday
  const mon = { ...tue, schedule_day: 1 };
  assert.strictEqual(isRadarDue(mon, aest(2026, 7, 14, 9, 0)), false); // not Monday
});

test('weekly without a day → 7-day cadence', () => {
  const r = { frequency: 'weekly', time_aest: '09:00', last_run_at: aest(2026, 7, 14, 9, 0) };
  assert.strictEqual(isRadarDue(r, aest(2026, 7, 18, 9, 0)), false); // 4 days later
  assert.strictEqual(isRadarDue(r, aest(2026, 7, 21, 9, 0)), true);  // 7 days later
});

test('monthly: once per calendar month', () => {
  const r = { frequency: 'monthly', time_aest: '09:00', last_run_at: aest(2026, 7, 2, 9, 0) };
  assert.strictEqual(isRadarDue(r, aest(2026, 7, 28, 9, 0)), false); // same month
  assert.strictEqual(isRadarDue(r, aest(2026, 8, 1, 9, 0)), true);   // next month
});

test('send-time gate uses AEST, not UTC (a UTC-day-boundary run still respects local time)', () => {
  // 2026-07-14 23:30 UTC == 2026-07-15 09:30 AEST → a daily 09:00 radar is due
  // on the 15th (AEST), even though it is still the 14th in UTC.
  const r = { frequency: 'daily', time_aest: '09:00', last_run_at: aest(2026, 7, 14, 9, 0) };
  const nowUtc = new Date(Date.UTC(2026, 6, 14, 23, 30)).toISOString();
  assert.strictEqual(isRadarDue(r, nowUtc), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
