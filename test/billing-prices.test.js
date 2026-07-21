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

test('Pro is $20/month and $200/year', () => {
  assert.strictEqual(PLANS.pro.month, 2000);
  assert.strictEqual(PLANS.pro.year, 20000);
});

test('Max is $200/month and $2,000/year', () => {
  assert.strictEqual(PLANS.max.month, 20000);
  assert.strictEqual(PLANS.max.year, 200000);
});

test('annual really is 2 months free on every paid plan', () => {
  for (const key of ['pro', 'max']) {
    const p = PLANS[key];
    assert.strictEqual(p.year, p.month * 10, `${key}: annual must equal 10 months`);
    assert.strictEqual(p.month * 12 - p.year, p.month * 2, `${key}: saving must equal 2 months`);
  }
});

console.log('\nresolvePrice');

test('resolves the annual amount and interval', () => {
  const r = resolvePrice('pro', 'year');
  assert.strictEqual(r.amount, 20000);
  assert.strictEqual(r.interval, 'year');
  assert.strictEqual(r.plan.name, 'Maal Pro');
});

test('resolves the monthly amount and interval', () => {
  const r = resolvePrice('max', 'month');
  assert.strictEqual(r.amount, 20000);
  assert.strictEqual(r.interval, 'month');
});

test('an unknown interval falls back to monthly, never to a free or NaN charge', () => {
  for (const bad of ['weekly', '', null, undefined, 'YEAR ']) {
    const r = resolvePrice('pro', bad);
    assert.strictEqual(r.interval, 'month', `interval ${JSON.stringify(bad)}`);
    assert.strictEqual(r.amount, 2000);
  }
});

test('an unknown plan resolves to null so checkout refuses rather than charging', () => {
  for (const bad of ['enterprise', 'free', '', null, undefined]) {
    assert.strictEqual(resolvePrice(bad, 'month'), null, `plan ${JSON.stringify(bad)}`);
  }
});

test('every resolvable price is a positive integer number of cents', () => {
  for (const plan of ['pro', 'max']) {
    for (const interval of ['month', 'year']) {
      const { amount } = resolvePrice(plan, interval);
      assert.ok(Number.isInteger(amount) && amount > 0, `${plan}/${interval} = ${amount}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
