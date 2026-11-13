'use strict';
// Deterministic tests for lib/waitlist-gate.js — the invite-only signup rules.

const assert = require('assert');
const gate = require('../lib/waitlist-gate');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nwaitlist gate');

test('gate is ON by default and only an explicit off value opens it', () => {
  assert.strictEqual(gate.isGateOn({}), true);
  assert.strictEqual(gate.isGateOn({ WAITLIST_GATE: 'on' }), true);
  assert.strictEqual(gate.isGateOn({ WAITLIST_GATE: 'typo' }), true);
  for (const v of ['off', 'OFF', 'false', '0', 'no', ' off ']) {
    assert.strictEqual(gate.isGateOn({ WAITLIST_GATE: v }), false, v);
  }
});

test('while gated, only invited or joined entries may create an account', () => {
  const on = {};
  assert.strictEqual(gate.canCreateAccount(null, on), false);
  assert.strictEqual(gate.canCreateAccount({ status: 'pending' }, on), false);
  assert.strictEqual(gate.canCreateAccount({ status: 'invited' }, on), true);
  assert.strictEqual(gate.canCreateAccount({ status: 'joined' }, on), true);
  assert.strictEqual(gate.canCreateAccount({ status: 'weird' }, on), false);
});

test('gate off lets anyone create an account', () => {
  assert.strictEqual(gate.canCreateAccount(null, { WAITLIST_GATE: 'off' }), true);
});

test('Gmail address forms match the invited entry (dots, +tags, googlemail)', () => {
  const rows = [{ id: 1, email: 'John.Doe+expo@googlemail.com' }, { id: 2, email: 'other@gmail.com' }];
  // Signup routes hand us express-validator's normalised form.
  assert.strictEqual(gate.matchEntry(rows, 'johndoe@gmail.com').id, 1);
  assert.strictEqual(gate.matchEntry(rows, 'JOHN.DOE@gmail.com').id, 1);
  assert.strictEqual(gate.matchEntry(rows, 'johndoe2@gmail.com'), null);
  assert.deepStrictEqual(gate.candidateDomains('a@gmail.com'), ['gmail.com', 'googlemail.com']);
  assert.deepStrictEqual(gate.candidateDomains('a@example.com.au'), ['example.com.au']);
});

test('non-Gmail addresses keep their dots but ignore case', () => {
  const rows = [{ id: 7, email: 'Jane.Smith@Example.com.au' }];
  assert.strictEqual(gate.matchEntry(rows, 'jane.smith@example.com.au').id, 7);
  assert.strictEqual(gate.matchEntry(rows, 'janesmith@example.com.au'), null);
  assert.strictEqual(gate.matchEntry(rows, 'not-an-email'), null);
});

test('email, consent, status and source inputs are normalised safely', () => {
  assert.strictEqual(gate.normaliseEmail('  A@B.co '), 'a@b.co');
  assert.strictEqual(gate.normaliseEmail('nope'), null);
  assert.strictEqual(gate.normaliseEmail(42), null);
  assert.strictEqual(gate.parseConsent(true), true);
  assert.strictEqual(gate.parseConsent('on'), true);
  assert.strictEqual(gate.parseConsent(false), false);
  assert.strictEqual(gate.parseConsent(undefined), false);
  assert.strictEqual(gate.normaliseStatus('Invited'), 'invited');
  assert.strictEqual(gate.normaliseStatus('admin'), null);
  assert.strictEqual(gate.normaliseSource('Spring Expo 2026!'), 'spring-expo-2026');
  assert.strictEqual(gate.normaliseSource('<script>'), 'script');
  assert.strictEqual(gate.normaliseSource(''), 'website');
  assert.ok(gate.normaliseSource('x'.repeat(100)).length <= 40);
});

test('CSV export escapes quotes/commas and blocks spreadsheet formulas', () => {
  assert.strictEqual(gate.csvCell('plain'), 'plain');
  assert.strictEqual(gate.csvCell('a,b'), '"a,b"');
  assert.strictEqual(gate.csvCell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(gate.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.strictEqual(gate.csvCell(null), '');
  const csv = gate.toCsv([{ email: 'a@b.co', name: '+cmd', status: 'pending', source: 'website', consent_contact: true, score: 72, created_at: new Date('2026-11-14T00:00:00Z') }]);
  const [head, row] = csv.trim().split('\n');
  assert.strictEqual(head, 'email,name,status,source,consent_contact,score,created_at,invited_at,joined_at');
  assert.strictEqual(row, "a@b.co,'+cmd,pending,website,true,72,2026-11-14T00:00:00.000Z,,");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
