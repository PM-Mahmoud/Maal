'use strict';
// Deterministic tests for lib/referrals.js — "Refer 3 friends, renew for $4.99".
// Reward counting is money (it discounts a renewal), so it's pinned here.

const assert = require('assert');
const r = require('../lib/referrals');
const m = require('../lib/membership');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nreferral codes');

test('codes are 8 readable characters (no 0/O/1/I/L)', () => {
  for (let i = 0; i < 200; i++) {
    const c = r.generateCode();
    assert.strictEqual(c.length, 8);
    assert.ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(c), c);
  }
});

test('generateCode is deterministic for given bytes', () => {
  assert.strictEqual(r.generateCode(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7])), 'ABCDEFGH');
});

test('pasted codes are normalised; junk is rejected', () => {
  assert.strictEqual(r.normaliseCode(' abcd-efgh '), 'ABCDEFGH');
  assert.strictEqual(r.normaliseCode('ABCDEFG'), null);       // too short
  assert.strictEqual(r.normaliseCode('ABCDEFG0'), null);      // ambiguous char
  assert.strictEqual(r.normaliseCode('<script>'), null);
  assert.strictEqual(r.normaliseCode(null), null);
});

console.log('\ninvites past the waitlist');

test('a code invites up to 20 sign-ups, then stops', () => {
  const row = { user_id: 1, code: 'ABCDEFGH' };
  assert.strictEqual(r.inviteAllowed(row, 0), true);
  assert.strictEqual(r.inviteAllowed(row, 19), true);
  assert.strictEqual(r.inviteAllowed(row, 20), false);
  assert.strictEqual(r.inviteAllowed(null, 0), false);
});

test('self-referral is caught across address forms', () => {
  assert.strictEqual(r.isSelfReferral('John.Doe@gmail.com', 'johndoe+x@googlemail.com'), true);
  assert.strictEqual(r.isSelfReferral('a@example.com', 'b@example.com'), false);
  assert.strictEqual(r.isSelfReferral('', 'b@example.com'), false);
});

console.log('\nrewards');

test('renewal reward brings $49.99 down to exactly $4.99', () => {
  assert.strictEqual(r.RENEWAL_DISCOUNT_CENTS, 4500);
  assert.strictEqual(m.MEMBERSHIP.yearCents - r.RENEWAL_DISCOUNT_CENTS, m.MEMBERSHIP.firstYearCents);
});

test('a reward is granted at 3 paid friends, not before', () => {
  assert.strictEqual(r.shouldGrantReward(0, 0, false), false);
  assert.strictEqual(r.shouldGrantReward(2, 0, false), false);
  assert.strictEqual(r.shouldGrantReward(3, 0, false), true);
});

test('one reward per 3 paid friends, never twice for the same 3', () => {
  assert.strictEqual(r.shouldGrantReward(3, 1, false), false);
  assert.strictEqual(r.shouldGrantReward(5, 1, false), false);
  assert.strictEqual(r.shouldGrantReward(6, 1, false), true);
  assert.strictEqual(r.shouldGrantReward(9, 3, false), false);
});

test('no new reward while one is still unused', () => {
  assert.strictEqual(r.shouldGrantReward(6, 1, true), false);
});

test('progress shows friends toward the next reward (0..3)', () => {
  assert.deepStrictEqual(r.progress(0, 0), { paid: 0, towardsNext: 0, needed: 3 });
  assert.deepStrictEqual(r.progress(2, 0), { paid: 2, towardsNext: 2, needed: 3 });
  assert.deepStrictEqual(r.progress(3, 1), { paid: 3, towardsNext: 0, needed: 3 });
  assert.deepStrictEqual(r.progress(4, 1), { paid: 4, towardsNext: 1, needed: 3 });
  assert.deepStrictEqual(r.progress(10, 1), { paid: 10, towardsNext: 3, needed: 3 }); // capped
  assert.deepStrictEqual(r.progress(-1, null), { paid: 0, towardsNext: 0, needed: 3 });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
