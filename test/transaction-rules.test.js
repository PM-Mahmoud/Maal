'use strict';
// Deterministic tests for the PR 6 transactions-depth logic: the 18-group
// taxonomy, keyword auto-categorisation, the rules engine, and subscription
// detection. All pure — no DB, no network.

const assert = require('assert');
const cats = require('../lib/transaction-categories');
const { matchRule, computeAssignments, detectSubscriptions, inferCadence } = require('../services/transaction-rules');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.error('  ✗ ' + name); console.error('    ' + e.message); failed++; }
}

console.log('\ntaxonomy');

test('exactly 18 groups, each with sub-categories and keywords', () => {
  assert.strictEqual(cats.TAXONOMY.length, 18);
  for (const t of cats.TAXONOMY) {
    assert.ok(t.categories.length > 0, t.group + ' has categories');
    assert.ok(Array.isArray(t.keywords), t.group + ' has keywords');
  }
});

test('isKnownGroup / isValidCategory validate input', () => {
  assert.ok(cats.isKnownGroup('Food & Dining'));
  assert.ok(!cats.isKnownGroup('Nonsense'));
  assert.ok(cats.isValidCategory('Food & Dining', 'Groceries'));
  assert.ok(!cats.isValidCategory('Food & Dining', 'Rocket fuel'));
});

console.log('\nautoCategorize (AU merchants)');

test('maps common AU merchants to the right group', () => {
  assert.strictEqual(cats.autoCategorize('WOOLWORTHS 1234 SYDNEY', -50).group, 'Food & Dining');
  assert.strictEqual(cats.autoCategorize('BP CONNECT MELBOURNE', -80).group, 'Auto & Transport');
  assert.strictEqual(cats.autoCategorize('NETFLIX.COM', -18).group, 'Recurring & Subscriptions');
  assert.strictEqual(cats.autoCategorize('AGL ENERGY', -220).group, 'Bills & Utilities');
});

test('longest keyword wins: "amazon prime" is a subscription, not shopping', () => {
  assert.strictEqual(cats.autoCategorize('AMAZON PRIME MEMBERSHIP', -9).group, 'Recurring & Subscriptions');
  assert.strictEqual(cats.autoCategorize('AMAZON MARKETPLACE', -40).group, 'Shopping');
});

test('unmatched positive amount defaults to Income; unmatched debit → null', () => {
  assert.strictEqual(cats.autoCategorize('MYSTERY DEPOSIT', 500).group, 'Income');
  assert.strictEqual(cats.autoCategorize('zzz obscure', -12), null);
});

test('each keyword resolves to its OWN sub-category (not the group default)', () => {
  assert.deepStrictEqual(pick(cats.autoCategorize('ANZ INTEREST PAID', 3)), ['Income', 'Interest']);
  assert.deepStrictEqual(pick(cats.autoCategorize('THE COFFEE CLUB', -6)), ['Food & Dining', 'Cafes']);
  assert.deepStrictEqual(pick(cats.autoCategorize('NIB HEALTH INSURANCE', -180)), ['Financial', 'Insurance']);
  assert.deepStrictEqual(pick(cats.autoCategorize('NETFLIX.COM', -18)), ['Recurring & Subscriptions', 'Streaming']);
});

function pick(x) { return x ? [x.group, x.category] : null; }

console.log('\nmatchRule');

test('contains / equals / starts_with, case-insensitive', () => {
  assert.ok(matchRule({ match_type: 'contains', match_text: 'uber' }, { description: 'UBER *EATS' }));
  assert.ok(matchRule({ match_type: 'equals', match_text: 'rent' }, { description: 'Rent' }));
  assert.ok(!matchRule({ match_type: 'equals', match_text: 'rent' }, { description: 'Rentokil' }));
  assert.ok(matchRule({ match_type: 'starts_with', match_text: 'tfr' }, { description: 'TFR to savings' }));
  assert.ok(!matchRule({ match_type: 'contains', match_text: '' }, { description: 'anything' }));
});

console.log('\ncomputeAssignments (first matching rule wins)');

test('assigns categories; earlier rules take precedence', () => {
  const rules = [
    { match_type: 'contains', match_text: 'netflix', category_group: 'Recurring & Subscriptions', category: 'Streaming' },
    { match_type: 'contains', match_text: 'flix', category_group: 'Other', category: null },
  ];
  const txns = [
    { id: 1, description: 'NETFLIX.COM' },
    { id: 2, description: 'GROCERIES' },
  ];
  const a = computeAssignments(rules, txns);
  assert.strictEqual(a.length, 1);
  assert.deepStrictEqual(a[0], { transaction_id: 1, category_group: 'Recurring & Subscriptions', category: 'Streaming' });
});

console.log('\ninferCadence + detectSubscriptions');

test('infers cadence from median gap', () => {
  const monthly = ['2026-01-01', '2026-02-01', '2026-03-03', '2026-04-01'].map((d) => new Date(d));
  assert.strictEqual(inferCadence(monthly), 'monthly');
  const weekly = ['2026-01-01', '2026-01-08', '2026-01-15'].map((d) => new Date(d));
  assert.strictEqual(inferCadence(weekly), 'weekly');
  const irregular = ['2026-01-01', '2026-01-03', '2026-05-01'].map((d) => new Date(d));
  assert.strictEqual(inferCadence(irregular), null);
});

test('detects a monthly subscription and estimates the next charge', () => {
  const txns = [
    { id: 1, description: 'NETFLIX.COM SYDNEY', amount: -18.99, post_date: '2026-04-05' },
    { id: 2, description: 'NETFLIX.COM SYDNEY', amount: -18.99, post_date: '2026-05-05' },
    { id: 3, description: 'NETFLIX.COM SYDNEY', amount: -18.99, post_date: '2026-06-05' },
    { id: 4, description: 'WOOLWORTHS', amount: -63.20, post_date: '2026-06-06' }, // one-off, not a sub
  ];
  const subs = detectSubscriptions(txns);
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].cadence, 'monthly');
  assert.strictEqual(subs[0].occurrences, 3);
  assert.strictEqual(subs[0].amount, 18.99);
  assert.strictEqual(subs[0].nextEstimate, '2026-07-05');
});

test('ignores credits (money in) and sub-threshold merchants', () => {
  const txns = [
    { id: 1, description: 'SALARY', amount: 5000, post_date: '2026-04-01' },
    { id: 2, description: 'SALARY', amount: 5000, post_date: '2026-05-01' },
    { id: 3, description: 'SALARY', amount: 5000, post_date: '2026-06-01' },
    { id: 4, description: 'SPOTIFY', amount: -12, post_date: '2026-05-01' }, // only 2 occurrences
    { id: 5, description: 'SPOTIFY', amount: -12, post_date: '2026-06-01' },
  ];
  assert.strictEqual(detectSubscriptions(txns).length, 0);
});

test('groups same merchant despite noisy descriptions', () => {
  const txns = [
    { id: 1, description: 'SPOTIFY P1A2B3 AU', amount: -11.99, post_date: '2026-04-10' },
    { id: 2, description: 'SPOTIFY P9Z8Y7 AU', amount: -11.99, post_date: '2026-05-10' },
    { id: 3, description: 'SPOTIFY P4K5J6 AU', amount: -11.99, post_date: '2026-06-10' },
  ];
  const subs = detectSubscriptions(txns);
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].occurrences, 3);
});

test('different billers sharing a processor prefix + amount stay SEPARATE', () => {
  // "EFTPOS SPOTIFY" and "EFTPOS NETFLIX" at the same amount must not collapse
  // into one subscription just because they share the EFTPOS prefix.
  const txns = [
    { id: 1, description: 'EFTPOS SPOTIFY AU', amount: -11.99, post_date: '2026-01-01' },
    { id: 2, description: 'EFTPOS NETFLIX AU', amount: -11.99, post_date: '2026-01-02' },
    { id: 3, description: 'EFTPOS SPOTIFY AU', amount: -11.99, post_date: '2026-02-01' },
    { id: 4, description: 'EFTPOS NETFLIX AU', amount: -11.99, post_date: '2026-02-02' },
    { id: 5, description: 'EFTPOS SPOTIFY AU', amount: -11.99, post_date: '2026-03-01' },
    { id: 6, description: 'EFTPOS NETFLIX AU', amount: -11.99, post_date: '2026-03-02' },
  ];
  const subs = detectSubscriptions(txns);
  assert.strictEqual(subs.length, 2, 'spotify and netflix detected as separate subscriptions');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
