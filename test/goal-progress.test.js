'use strict';
// Deterministic tests for lib/goal-progress.js — live goal-progress derivation.
// Financial-calculation rule: this math must be covered before merge, not just
// eyeballed. Live financials are the shape of snapshotValuesFromProfile():
// { netWorth, cash, super, investments, debts }.

const assert = require('assert');
const { deriveGoalProgress, defaultSourceForCategory, liveSourceValue } = require('../lib/goal-progress');

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

const FIN = { netWorth: 250000, cash: 20000, super: 90000, investments: 60000, debts: 40000 };

console.log('\ngoal progress derivation');

test('manual goal uses the stored current_amount, ignores financials', () => {
  const r = deriveGoalProgress(
    { source_type: 'manual', target_amount: 10000, current_amount: 2500 },
    FIN
  );
  assert.strictEqual(r.current_amount, 2500);
  assert.strictEqual(r.target_amount, 10000);
  assert.strictEqual(r.pct, 25);
  assert.strictEqual(r.reached, false);
});

test('save-to-cash goal: current = live cash, absolute $ target', () => {
  const r = deriveGoalProgress(
    { source_type: 'cash', target_kind: 'amount', target_amount: 50000, baseline_amount: 5000 },
    FIN
  );
  assert.strictEqual(r.current_amount, 20000); // live cash, not the baseline
  assert.strictEqual(r.target_amount, 50000);
  assert.strictEqual(r.pct, 40);
  assert.strictEqual(r.reached, false);
});

test('grow-net-worth goal reaches 100% and clamps pct at 100', () => {
  const r = deriveGoalProgress(
    { source_type: 'net_worth', target_kind: 'amount', target_amount: 200000 },
    FIN
  );
  assert.strictEqual(r.current_amount, 250000);
  assert.strictEqual(r.pct, 100); // 250k/200k would be 125 → clamped
  assert.strictEqual(r.reached, true);
});

test('percent target = pct% of the baseline source value', () => {
  // "reach 120% of my investments at creation" — baseline 50k → target 60k.
  const r = deriveGoalProgress(
    { source_type: 'investments', target_kind: 'percent', target_pct: 120, baseline_amount: 50000 },
    FIN
  );
  assert.strictEqual(r.target_amount, 60000);
  assert.strictEqual(r.current_amount, 60000); // live investments == 60k
  assert.strictEqual(r.pct, 100);
  assert.strictEqual(r.reached, true);
});

test('pay-off goal: progress = baseline debt cleared so far (rises as debt falls)', () => {
  // Baseline debt 100k at creation, live debt now 40k → 60k cleared of 100k.
  const r = deriveGoalProgress(
    { source_type: 'debts', target_kind: 'amount', baseline_amount: 100000 },
    FIN
  );
  assert.strictEqual(r.target_amount, 100000); // default = clear the whole baseline
  assert.strictEqual(r.current_amount, 60000);
  assert.strictEqual(r.pct, 60);
  assert.strictEqual(r.reached, false);
});

test('pay-off with explicit smaller target: cleared caps at the target, reached', () => {
  // Wanted to pay down 50k; already cleared 60k → shown as 50k/50k, reached.
  const r = deriveGoalProgress(
    { source_type: 'debts', target_kind: 'amount', target_amount: 50000, baseline_amount: 100000 },
    FIN
  );
  assert.strictEqual(r.target_amount, 50000);
  assert.strictEqual(r.current_amount, 50000);
  assert.strictEqual(r.pct, 100);
  assert.strictEqual(r.reached, true);
});

test('pay-off percent target: pct% of baseline debt', () => {
  // Pay off 50% of a 100k baseline = 50k target; 60k cleared → capped at 50k.
  const r = deriveGoalProgress(
    { source_type: 'debts', target_kind: 'percent', target_pct: 50, baseline_amount: 100000 },
    FIN
  );
  assert.strictEqual(r.target_amount, 50000);
  assert.strictEqual(r.current_amount, 50000);
  assert.strictEqual(r.reached, true);
});

test('debt that went UP since creation shows 0 cleared, never negative', () => {
  const r = deriveGoalProgress(
    { source_type: 'debts', baseline_amount: 30000 }, // live debt 40k > baseline
    FIN
  );
  assert.strictEqual(r.current_amount, 0);
  assert.strictEqual(r.pct, 0);
});

test('zero / missing target yields 0% (no divide-by-zero)', () => {
  const r = deriveGoalProgress({ source_type: 'cash', target_amount: 0 }, FIN);
  assert.strictEqual(r.pct, 0);
  assert.strictEqual(r.reached, false);
});

test('unknown source_type falls back to manual behaviour', () => {
  const r = deriveGoalProgress(
    { source_type: 'wat', target_amount: 100, current_amount: 50 },
    FIN
  );
  assert.strictEqual(r.current_amount, 50);
  assert.strictEqual(r.pct, 50);
});

test('non-numeric / missing financials degrade to 0, never NaN', () => {
  const r = deriveGoalProgress({ source_type: 'cash', target_amount: 1000 }, null);
  assert.strictEqual(r.current_amount, 0);
  assert.ok(Number.isFinite(r.pct));
});

test('amounts are rounded to cents', () => {
  const r = deriveGoalProgress(
    { source_type: 'cash', target_amount: 3 },
    { cash: 1.005 }
  );
  assert.strictEqual(r.current_amount, 1.01);
});

test('liveSourceValue clamps debts/sources at >= 0 and maps keys', () => {
  assert.strictEqual(liveSourceValue('net_worth', FIN), 250000);
  assert.strictEqual(liveSourceValue('debts', { debts: -5 }), 0);
  assert.strictEqual(liveSourceValue('manual', FIN), 0);
});

test('defaultSourceForCategory maps categories to aggregate sources', () => {
  assert.strictEqual(defaultSourceForCategory('debt'), 'debts');
  assert.strictEqual(defaultSourceForCategory('retirement'), 'super');
  assert.strictEqual(defaultSourceForCategory('invest'), 'investments');
  assert.strictEqual(defaultSourceForCategory('emergency'), 'cash');
  assert.strictEqual(defaultSourceForCategory('other'), 'manual');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
