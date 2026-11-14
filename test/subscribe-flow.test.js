'use strict';
// Deterministic tests for the subscribe flow helpers in routes/billing.js:
// the price copy the subscribe screens print (GST-inclusive AUD, "90% off"),
// the whitelisted Checkout return targets, and how a retrieved Stripe Checkout
// session is classified while the Payment processing screen polls.

const assert = require('assert');
const billing = require('../routes/billing');
const membership = require('../lib/membership');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nsubscribe flow: offer copy (cents, AUD, GST-inclusive)');

test('offer is $4.99 first year then $49.99/year, from lib/membership.js', () => {
  const o = billing.offerSummary();
  assert.strictEqual(o.firstYearCents, 499);
  assert.strictEqual(o.renewalCents, 4999);
  assert.strictEqual(o.firstYear, '$4.99');
  assert.strictEqual(o.renewal, '$49.99');
  assert.strictEqual(o.firstYearCents, membership.MEMBERSHIP.firstYearCents);
  assert.strictEqual(o.renewalCents, membership.MEMBERSHIP.yearCents);
  assert.strictEqual(o.currency, 'AUD');
  assert.strictEqual(o.gstInclusive, true);
});

test('first-year price equals what Stripe charges (year minus coupon)', () => {
  const o = billing.offerSummary();
  assert.strictEqual(billing.PLANS.member.year - billing.PLANS.member.firstYearDiscount, o.firstYearCents);
});

test('GST included in a GST-inclusive price is 1/11, rounded to the cent', () => {
  assert.strictEqual(billing.gstIncludedCents(1100), 100);
  assert.strictEqual(billing.gstIncludedCents(499), 45);   // 45.36…
  assert.strictEqual(billing.gstIncludedCents(4999), 454); // 454.45…
  assert.strictEqual(billing.gstIncludedCents(0), 0);
  const o = billing.offerSummary();
  assert.strictEqual(o.firstYearGstCents, 45);
  assert.strictEqual(o.renewalGstCents, 454);
});

test('"% off" badge is the real first-year saving, rounded down (90%)', () => {
  const o = billing.offerSummary();
  assert.strictEqual(o.discountPercent, 90);
  // Never overstate: the advertised % must not exceed the true saving.
  assert.ok(o.discountPercent / 100 <= (o.renewalCents - o.firstYearCents) / o.renewalCents);
});

test('trial length shown on the screens is the 14-day trial', () => {
  assert.strictEqual(billing.offerSummary().trialDays, 14);
});

console.log('\nsubscribe flow: Checkout return targets');

test('only whitelisted targets are accepted; anything else is billing', () => {
  assert.strictEqual(billing.resolveReturnTarget('subscribe'), 'subscribe');
  assert.strictEqual(billing.resolveReturnTarget('SUBSCRIBE'), 'subscribe');
  assert.strictEqual(billing.resolveReturnTarget('billing'), 'billing');
  assert.strictEqual(billing.resolveReturnTarget(undefined), 'billing');
  assert.strictEqual(billing.resolveReturnTarget('https://evil.example/'), 'billing');
  assert.strictEqual(billing.resolveReturnTarget('//evil.example'), 'billing');
});

test('subscribe target returns to /subscribe processing with the session id', () => {
  const u = billing.checkoutUrls('https://www.hellomaal.com', 'member', 'subscribe');
  assert.strictEqual(u.success_url, 'https://www.hellomaal.com/subscribe?status=processing&session_id={CHECKOUT_SESSION_ID}');
  assert.strictEqual(u.cancel_url, 'https://www.hellomaal.com/subscribe?status=cancel');
});

test('default target keeps the original /billing/success + /app/billing URLs', () => {
  const u = billing.checkoutUrls('https://www.hellomaal.com', 'member', undefined);
  assert.strictEqual(u.success_url, 'https://www.hellomaal.com/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=member');
  assert.strictEqual(u.cancel_url, 'https://www.hellomaal.com/app/billing?billing=cancel');
});

test('no-Stripe redirects: demo walks the processing screen, errors are explicit', () => {
  assert.strictEqual(billing.noStripeRedirect('subscribe', 'demo', 'member'), '/subscribe?status=processing&demo=1');
  assert.strictEqual(billing.noStripeRedirect('subscribe', 'error', 'member'), '/subscribe?status=error&reason=config');
  assert.strictEqual(billing.noStripeRedirect('billing', 'demo', 'member'), '/app/billing?billing=demo&plan=member');
  assert.strictEqual(billing.noStripeRedirect('billing', 'error', 'member'), '/app/billing?billing=error_config');
});

console.log('\nsubscribe flow: Checkout session classification');

const sess = (over) => Object.assign({ metadata: { userId: '42', plan: 'member' }, payment_status: 'paid', status: 'complete' }, over);

test('paid session belonging to the user → paid', () => {
  assert.strictEqual(billing.classifySession(sess(), 42), 'paid');
  assert.strictEqual(billing.classifySession(sess({ payment_status: 'no_payment_required' }), '42'), 'paid');
});

test('unpaid but open session → pending (keep polling)', () => {
  assert.strictEqual(billing.classifySession(sess({ payment_status: 'unpaid', status: 'open' }), 42), 'pending');
});

test("another user's session is never accepted", () => {
  assert.strictEqual(billing.classifySession(sess({ metadata: { userId: '7', plan: 'member' } }), 42), 'invalid');
});

test('unknown plan, expired or missing session → invalid', () => {
  assert.strictEqual(billing.classifySession(sess({ metadata: { userId: '42', plan: 'gold' } }), 42), 'invalid');
  assert.strictEqual(billing.classifySession(sess({ payment_status: 'unpaid', status: 'expired' }), 42), 'invalid');
  assert.strictEqual(billing.classifySession(null, 42), 'invalid');
  assert.strictEqual(billing.classifySession({}, 42), 'invalid');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
