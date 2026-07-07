'use strict';

// test/profile-mapping.test.js
// Deterministic tests for db/profiles.js pure mappers behind GET/PATCH
// /api/v1/profile — the seam between the React profile shape (display_name /
// age_band / risk in onboarding_data) and the user_profiles columns. No DB.

const assert = require('assert');
const { normalizeProfile, profilePatchToColumns, deriveAge } = require('../db/profiles');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nderiveAge');

test('maps age_band buckets to representative ages', () => {
  assert.strictEqual(deriveAge('under-30', {}), 27);
  assert.strictEqual(deriveAge('30-39', {}), 35);
  assert.strictEqual(deriveAge('40-49', {}), 45);
  assert.strictEqual(deriveAge('50-59', {}), 55);
  assert.strictEqual(deriveAge('60+', {}), 65);
});

test('falls back to legacy years_in_practice proxy, then to 35', () => {
  assert.strictEqual(deriveAge(null, { years_in_practice: 10 }), 35); // 25 + 10
  assert.strictEqual(deriveAge(null, { years_in_practice: 3 }), 28);
  assert.strictEqual(deriveAge(null, {}), 35);
  assert.strictEqual(deriveAge(undefined, null), 35);
});

console.log('\nnormalizeProfile');

test('null row + user email → display_name falls back to email local-part', () => {
  const out = normalizeProfile(null, { email: 'alex@example.com' });
  assert.strictEqual(out.display_name, 'alex');
  assert.strictEqual(out.age_band, null);
  assert.strictEqual(out.risk, null);
  assert.strictEqual(out.age, 35);
  assert.strictEqual(out.completed_onboarding, false);
  assert.strictEqual(out.retirement_age, 67);
});

test('reads display_name/age_band/risk out of onboarding_data JSONB', () => {
  const row = {
    onboarding_data: { display_name: 'Sam', age_band: '40-49', risk: 'growth' },
    annual_income: '120000', super_balance: '85000', completed_onboarding: true,
  };
  const out = normalizeProfile(row, { email: 'ignored@x.com' });
  assert.strictEqual(out.display_name, 'Sam'); // onboarding_data wins over email
  assert.strictEqual(out.age_band, '40-49');
  assert.strictEqual(out.risk, 'growth');
  assert.strictEqual(out.age, 45);
  assert.strictEqual(out.annual_income, 120000); // numeric-string coerced
  assert.strictEqual(typeof out.annual_income, 'number');
  assert.strictEqual(out.onboarded, true);
});

console.log('\nprofilePatchToColumns');

test('routes display_name/age_band/risk into onboarding_data, not columns', () => {
  const { cols, onboarding_data } = profilePatchToColumns({ display_name: 'Jo', age_band: '30-39', risk: 'balanced' });
  assert.deepStrictEqual(onboarding_data, { display_name: 'Jo', age_band: '30-39', risk: 'balanced' });
  assert.deepStrictEqual(cols, {});
});

test('only emits keys present in the patch (partial semantics)', () => {
  const { cols, onboarding_data } = profilePatchToColumns({ annual_income: 90000 });
  assert.deepStrictEqual(cols, { annual_income: 90000 });
  assert.deepStrictEqual(onboarding_data, {});
});

test('coerces numeric columns; skips empty string / null / undefined', () => {
  const { cols } = profilePatchToColumns({ annual_income: '90000', super_balance: '', monthly_expenses: null, retirement_age: undefined });
  assert.deepStrictEqual(cols, { annual_income: 90000 });
});

test('maps onboarded/completed_onboarding alias to the real column', () => {
  assert.strictEqual(profilePatchToColumns({ onboarded: true }).cols.completed_onboarding, true);
  assert.strictEqual(profilePatchToColumns({ completed_onboarding: false }).cols.completed_onboarding, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
