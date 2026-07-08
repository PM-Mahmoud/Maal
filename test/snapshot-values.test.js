'use strict';

// test/snapshot-values.test.js
// Deterministic tests for db/snapshots.js snapshotValuesFromProfile() — the pure
// net-worth math shared by the EJS dashboard and GET /api/v1/snapshots. Per
// CLAUDE.md's rule, this financial calculation is tested. No DB.

const assert = require('assert');
const { snapshotValuesFromProfile } = require('../db/snapshots');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nsnapshotValuesFromProfile');

test('empty / undefined profile → all zeros', () => {
  assert.deepStrictEqual(snapshotValuesFromProfile({}), {
    netWorth: 0, assetsTotal: 0, superBalance: 0, investBalance: 0, debtsTotal: 0, cashBalance: 0,
  });
  assert.strictEqual(snapshotValuesFromProfile().netWorth, 0);
});

test('assets = super + investments + property + cash; net worth subtracts debts', () => {
  const v = snapshotValuesFromProfile({
    super_balance: 100000, investment_portfolio: 50000, property_value: 700000,
    cash_savings: 20000, total_debt: 30000, hecs_balance: 15000,
  });
  assert.strictEqual(v.assetsTotal, 870000);       // 100k+50k+700k+20k
  assert.strictEqual(v.debtsTotal, 45000);         // 30k + 15k HECS
  assert.strictEqual(v.netWorth, 825000);          // 870k - 45k
  assert.strictEqual(v.superBalance, 100000);
  assert.strictEqual(v.investBalance, 50000);
  assert.strictEqual(v.cashBalance, 20000);
});

test('coerces Postgres BIGINT-as-string values', () => {
  const v = snapshotValuesFromProfile({ super_balance: '85000', total_debt: '5000' });
  assert.strictEqual(v.superBalance, 85000);
  assert.strictEqual(v.netWorth, 80000);
  assert.strictEqual(typeof v.netWorth, 'number');
});

test('HECS counts fully toward the snapshot debt total (unlike the score weighting)', () => {
  const v = snapshotValuesFromProfile({ hecs_balance: 40000 });
  assert.strictEqual(v.debtsTotal, 40000);
  assert.strictEqual(v.netWorth, -40000);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
