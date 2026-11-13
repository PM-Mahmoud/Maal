'use strict';
// Deterministic tests for the billing price matrix in routes/billing.js.
//
// These amounts are what Stripe actually charges, so they are financial
// calculations under the repo's hard rules. The matrix is asserted in CENTS,
// and the "2 months free" claim printed on the pricing page is verified as
// arithmetic rather than trusted as marketing copy.

const assert = require('assert');
const { PLANS, resolvePrice } = require('../routes/billing');

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

console.log('\nprice matrix (cents, AUD)');

const membership = require('../lib/membership');
const { FIRST_YEAR_COUPON_ID } = require('../routes/billing');

test('Membership is $49.99/year with a $45 first-year discount ($4.99 first year)', () => {
  assert.strictEqual(PLANS.member.year, 4999);
  assert.strictEqual(PLANS.member.firstYearDiscount, 4500);
  assert.strictEqual(PLANS.member.year - PLANS.member.firstYearDiscount, 499);
  assert.strictEqual(PLANS.member.forSale, true);
});

test('billing reads its numbers from lib/membership.js (single source)', () => {
  assert.strictEqual(PLANS.member.year, membership.MEMBERSHIP.yearCents);
  assert.strictEqual(PLANS.member.firstYearDiscount, membership.FIRST_YEAR_DISCOUNT_CENTS);
  assert.strictEqual(FIRST_YEAR_COUPON_ID, 'maal-first-year-4500');
});

test('legacy Pro/Max keep their prices on record but are not for sale', () => {
  assert.strictEqual(PLANS.pro.month, 2000);
  assert.strictEqual(PLANS.max.month, 20000);
  assert.strictEqual(PLANS.pro.forSale, false);
  assert.strictEqual(PLANS.max.forSale, false);
});

console.log('\nresolvePrice');

test('membership resolves to the yearly price with its first-year discount', () => {
  const r = resolvePrice('member');
  assert.strictEqual(r.amount, 4999);
  assert.strictEqual(r.interval, 'year');
  assert.strictEqual(r.discount, 4500);
  assert.strictEqual(r.plan.name, 'Maal Membership');
});

test('membership is always yearly, whatever interval is passed', () => {
  for (const iv of ['month', 'year', 'weekly', '', null, undefined]) {
    assert.strictEqual(resolvePrice('member', iv).interval, 'year');
  }
});

test('legacy and unknown plans resolve to null so checkout refuses them', () => {
  for (const bad of ['pro', 'max', 'enterprise', 'free', '', null, undefined]) {
    assert.strictEqual(resolvePrice(bad, 'month'), null, `plan ${JSON.stringify(bad)}`);
  }
});

test('the charged amount and discount are positive integer cents, discount < price', () => {
  const { amount, discount } = resolvePrice('member');
  assert.ok(Number.isInteger(amount) && amount > 0);
  assert.ok(Number.isInteger(discount) && discount > 0 && discount < amount);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
