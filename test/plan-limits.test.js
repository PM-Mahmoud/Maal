'use strict';
// Deterministic tests for lib/plan-limits.js — the usage-metering rules.
// These numbers are a product decision (specs/silvia-parity-tier1-2.md,
// decision 10): Free = 0 AI usage at launch, Max advisor soft cap = 1000.

const assert = require('assert');
const { PLAN_LIMITS, normalizePlan, periodKey, limitFor, evaluate, upgradeMessage, MONTHLY_FEATURES } = require('../lib/plan-limits');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\nplan limits (product contract)');

test('Free tier = 0 AI usage everywhere (launch cost guardrail)', () => {
  for (const f of Object.keys(PLAN_LIMITS.free)) {
    assert.strictEqual(PLAN_LIMITS.free[f], 0, 'free.' + f);
    assert.strictEqual(evaluate('free', f, 0).allowed, false, 'free.' + f + ' must be denied at 0 used');
  }
});

test('Pro: 500 messages / 10 research / 10 radars / 10 files', () => {
  assert.strictEqual(PLAN_LIMITS.pro.advisor_messages, 500);
  assert.strictEqual(PLAN_LIMITS.pro.research_runs, 10);
  assert.strictEqual(PLAN_LIMITS.pro.active_radars, 10);
  assert.strictEqual(PLAN_LIMITS.pro.ai_files, 10);
});

test('Max advisor soft cap is exactly 1000', () => {
  assert.strictEqual(PLAN_LIMITS.max.advisor_messages, 1000);
  assert.strictEqual(evaluate('max', 'advisor_messages', 999).allowed, true);
  assert.strictEqual(evaluate('max', 'advisor_messages', 1000).allowed, false);
});

console.log('\nevaluate()');

test('boundary: allowed strictly below the limit, denied at it', () => {
  assert.strictEqual(evaluate('pro', 'research_runs', 9).allowed, true);
  assert.strictEqual(evaluate('pro', 'research_runs', 10).allowed, false);
  assert.strictEqual(evaluate('pro', 'research_runs', 9).remaining, 1);
  assert.strictEqual(evaluate('pro', 'research_runs', 10).remaining, 0);
});

test('unknown plan or feature is treated as free / zero (deny)', () => {
  assert.strictEqual(normalizePlan('enterprise'), 'free');
  assert.strictEqual(normalizePlan(null), 'free');
  assert.strictEqual(normalizePlan('PRO'), 'pro'); // case-insensitive
  assert.strictEqual(limitFor('pro', 'nonexistent_feature'), 0);
  assert.strictEqual(evaluate('bogus', 'advisor_messages', 0).allowed, false);
});

test('garbage `used` values never grant access', () => {
  assert.strictEqual(evaluate('free', 'advisor_messages', -5).allowed, false);
  assert.strictEqual(evaluate('free', 'advisor_messages', NaN).allowed, false);
  assert.strictEqual(evaluate('pro', 'advisor_messages', -5).used, 0); // clamped
});

console.log('\nperiodKey() — resets on the 1st');

test('period key is YYYY-MM and flips exactly at month boundaries', () => {
  assert.strictEqual(periodKey('2026-07-12'), '2026-07');
  assert.strictEqual(periodKey('2026-07-31T23:59:59'), '2026-07');
  assert.strictEqual(periodKey('2026-08-01T00:00:00'), '2026-08');
  assert.strictEqual(periodKey('2026-12-31'), '2026-12');
  assert.strictEqual(periodKey('2027-01-01'), '2027-01');
});

test('usage in a new month starts from a different key (implicit reset)', () => {
  assert.notStrictEqual(periodKey('2026-07-31'), periodKey('2026-08-01'));
});

console.log('\nupgradeMessage()');

test('free-tier message pitches Pro; paid-tier message explains the reset', () => {
  assert.ok(upgradeMessage('free', 'advisor_messages').includes('Pro'));
  assert.ok(upgradeMessage('pro', 'research_runs').includes('resets on the 1st'));
  assert.ok(upgradeMessage('pro', 'research_runs').includes('Max'));
  assert.ok(!upgradeMessage('max', 'advisor_messages').includes('Upgrade to Max'));
});

test('active_radars (concurrent) message talks about pausing, not a monthly reset', () => {
  const msg = upgradeMessage('pro', 'active_radars');
  assert.ok(/pause|delete/i.test(msg), 'should tell user to free a slot');
  assert.ok(!msg.includes('resets on the 1st'), 'concurrent limit is not a monthly quota');
});

test('MONTHLY_FEATURES excludes the concurrent active_radars limit', () => {
  assert.ok(MONTHLY_FEATURES.includes('advisor_messages'));
  assert.ok(!MONTHLY_FEATURES.includes('active_radars'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
