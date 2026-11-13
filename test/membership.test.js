'use strict';
// Deterministic tests for lib/membership.js — the price we charge and the
// 14-day trial rules. Financial calculations, so asserted in CENTS.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const m = require('../lib/membership');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

const DAY = m.DAY_MS;
const START = new Date('2026-11-15T00:00:00Z');

console.log('\nmembership price');

test('$4.99 first year, then $49.99/year, AUD, yearly', () => {
  assert.strictEqual(m.MEMBERSHIP.key, 'member');
  assert.strictEqual(m.MEMBERSHIP.firstYearCents, 499);
  assert.strictEqual(m.MEMBERSHIP.yearCents, 4999);
  assert.strictEqual(m.MEMBERSHIP.currency, 'aud');
  assert.strictEqual(m.MEMBERSHIP.interval, 'year');
});

test('first-year discount is exactly yearly minus first-year price', () => {
  assert.strictEqual(m.FIRST_YEAR_DISCOUNT_CENTS, 4500);
  assert.strictEqual(m.MEMBERSHIP.yearCents - m.FIRST_YEAR_DISCOUNT_CENTS, m.MEMBERSHIP.firstYearCents);
});

test('offer line shows the renewal price next to the intro price (ACL)', () => {
  assert.strictEqual(m.offerLine(), '$4.99 for your first year, then $49.99/year. Cancel anytime.');
  assert.strictEqual(m.formatAud(499), '$4.99');
  assert.strictEqual(m.formatAud(4999), '$49.99');
});

test('homepage copy matches the real prices (no drift)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'routes', 'index.tsx'), 'utf8');
  assert.ok(src.includes(m.formatAud(m.MEMBERSHIP.firstYearCents)), 'homepage missing first-year price');
  assert.ok(src.includes(m.formatAud(m.MEMBERSHIP.yearCents) + '/year'), 'homepage missing renewal price');
  assert.ok(src.includes(m.TRIAL_DAYS + '-day free trial'), 'homepage missing trial length');
});

console.log('\ntrial');

test('trial is 14 days from the start', () => {
  assert.strictEqual(m.TRIAL_DAYS, 14);
  assert.strictEqual(m.trialEndsAt(START).toISOString(), '2026-11-29T00:00:00.000Z');
  assert.strictEqual(m.trialEndsAt('garbage'), null);
});

test('days left rounds up and hits 0 exactly at the end', () => {
  const trial = { started_at: START, ends_at: m.trialEndsAt(START) };
  assert.deepStrictEqual(m.trialStatus(trial, START).daysLeft, 14);
  assert.strictEqual(m.trialStatus(trial, new Date(START.getTime() + 13 * DAY + 21 * 3600e3)).daysLeft, 1); // 3h left
  const atEnd = m.trialStatus(trial, m.trialEndsAt(START));
  assert.strictEqual(atEnd.active, false);
  assert.strictEqual(atEnd.daysLeft, 0);
});

test('no trial row or a broken row is never active', () => {
  assert.strictEqual(m.trialStatus(null, START).active, false);
  assert.strictEqual(m.trialStatus({ ends_at: 'nope' }, START).active, false);
});

console.log('\neffective plan / access');

test('trial gives member access; expired trial is free + paywalled', () => {
  const trial = { started_at: START, ends_at: m.trialEndsAt(START) };
  const during = m.accessFor('free', trial, new Date(START.getTime() + 5 * DAY));
  assert.strictEqual(during.plan, 'member');
  assert.strictEqual(during.paywalled, false);
  assert.strictEqual(during.trial.daysLeft, 9);
  const after = m.accessFor('free', trial, new Date(START.getTime() + 15 * DAY));
  assert.strictEqual(after.plan, 'free');
  assert.strictEqual(after.paywalled, true);
  assert.strictEqual(after.trial.active, false);
});

test('paid plans ignore the trial and are never paywalled (incl. legacy pro/max)', () => {
  const expired = { ends_at: new Date(START.getTime() - DAY) };
  for (const plan of ['member', 'pro', 'max', 'MEMBER']) {
    const a = m.accessFor(plan, expired, START);
    assert.strictEqual(a.plan, plan.toLowerCase());
    assert.strictEqual(a.paywalled, false);
    assert.strictEqual(a.trial, null);
  }
});

test('unknown stored plans are treated as unpaid', () => {
  assert.strictEqual(m.isPaidPlan('enterprise'), false);
  assert.strictEqual(m.effectivePlan('enterprise', null, START), 'free');
  assert.strictEqual(m.effectivePlan(null, null, START), 'free');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
