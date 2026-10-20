'use strict';
// Deterministic tests for lib/training-consent.js — model-training consent rules (spec D4).

const assert = require('assert');
const {
  POLICY_VERSION, stateAt, isEligible, isEligibleForSource, summarize,
} = require('../lib/training-consent');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

const D = (s) => new Date(`2026-${s}T00:00:00Z`);
const row = (scope, granted, date, policy = POLICY_VERSION) =>
  ({ scope, granted, created_at: D(date), policy_version: policy });
const NOW = D('12-01');

console.log('\ntraining consent');

test('no consent rows → nothing is eligible (pre-disclosure data is never usable)', () => {
  assert.strictEqual(isEligible([], 'general', D('11-01'), NOW), false);
  assert.strictEqual(isEligible(undefined, 'general', D('11-01'), NOW), false);
});

test('data created after a grant, consent still on → eligible', () => {
  const rows = [row('general', true, '10-21')];
  assert.strictEqual(isEligible(rows, 'general', D('11-01'), NOW), true);
});

test('data created BEFORE the grant → not eligible', () => {
  const rows = [row('general', true, '10-21')];
  assert.strictEqual(isEligible(rows, 'general', D('10-01'), NOW), false);
});

test('opt-out removes earlier eligible data from future builds', () => {
  const rows = [row('general', true, '10-21'), row('general', false, '11-15')];
  assert.strictEqual(isEligible(rows, 'general', D('11-01'), NOW), false);
});

test('data created while opted out stays ineligible after opting back in', () => {
  const rows = [row('general', true, '10-21'), row('general', false, '11-01'), row('general', true, '11-20')];
  assert.strictEqual(isEligible(rows, 'general', D('11-10'), NOW), false);
  assert.strictEqual(isEligible(rows, 'general', D('11-25'), NOW), true);
});

test('a future-dated row does not count before its time', () => {
  const rows = [row('general', true, '12-15')];
  assert.strictEqual(stateAt(rows, 'general', NOW), null);
  assert.strictEqual(isEligible(rows, 'general', D('12-20'), NOW), false);
});

test('general consent does not unlock CDR (Basiq) data', () => {
  const rows = [row('general', true, '10-21')];
  assert.strictEqual(isEligibleForSource(rows, 'basiq', D('11-01'), NOW), false);
  assert.strictEqual(isEligibleForSource(rows, 'chat', D('11-01'), NOW), true);
});

test('CDR data needs an explicit cdr grant', () => {
  const rows = [row('general', true, '10-21'), row('cdr', true, '10-25')];
  assert.strictEqual(isEligibleForSource(rows, 'basiq', D('11-01'), NOW), true);
});

test('Google-sourced and unknown sources are never eligible', () => {
  const rows = [row('general', true, '10-01'), row('cdr', true, '10-01')];
  assert.strictEqual(isEligibleForSource(rows, 'google', D('11-01'), NOW), false);
  assert.strictEqual(isEligibleForSource(rows, 'something_new', D('11-01'), NOW), false);
  assert.strictEqual(isEligible(rows, 'bogus', D('11-01'), NOW), false);
});

test('invalid dates fail closed', () => {
  const rows = [row('general', true, '10-01')];
  assert.strictEqual(isEligible(rows, 'general', 'not a date', NOW), false);
});

test('summarize: no rows → needs notice, not granted', () => {
  const s = summarize([], NOW);
  assert.strictEqual(s.general.granted, false);
  assert.strictEqual(s.general.needsNotice, true);
  assert.strictEqual(s.cdr.granted, false);
  assert.strictEqual(s.policyVersion, POLICY_VERSION);
});

test('summarize: current-policy row → no notice; older policy → notice again', () => {
  assert.strictEqual(summarize([row('general', true, '10-21')], NOW).general.needsNotice, false);
  const old = summarize([row('general', true, '10-21', '2026-01-01')], NOW);
  assert.strictEqual(old.general.needsNotice, true);
  assert.strictEqual(old.general.granted, true);
});

test('summarize: an opt-out on the current policy counts as noticed', () => {
  const s = summarize([row('general', false, '10-22')], NOW);
  assert.strictEqual(s.general.granted, false);
  assert.strictEqual(s.general.needsNotice, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
