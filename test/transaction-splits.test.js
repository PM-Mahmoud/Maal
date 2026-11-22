'use strict';

// test/transaction-splits.test.js
// Deterministic tests for shared/transaction-splits.mjs — split validation
// (parts must sum exactly to the original), equal splits in cents, and the
// effective-rows helper that drops hidden rows and expands splits for totals.
// No DB, no network.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const m = await import('../shared/transaction-splits.mjs');
  console.log('\ntransaction-splits');

  await test('toCents parses money strings and rejects sub-cent precision', () => {
    assert.strictEqual(m.toCents('$1,234.50'), 123450);
    assert.strictEqual(m.toCents(71.95), 7195);
    assert.strictEqual(m.toCents('-16.5'), -1650);
    assert.ok(Number.isNaN(m.toCents('1.005')));
    assert.ok(Number.isNaN(m.toCents('abc')));
    assert.ok(Number.isNaN(m.toCents('')));
  });

  await test('equalSplit distributes leftover cents to the first parts and sums exactly', () => {
    assert.deepStrictEqual(m.equalSplit(71.95, 2), [35.98, 35.97]);
    assert.deepStrictEqual(m.equalSplit(-10, 3), [3.34, 3.33, 3.33]);
    const parts = m.equalSplit(100.01, 7);
    assert.strictEqual(parts.reduce((a, b) => a + Math.round(b * 100), 0), 10001);
  });

  await test('remainingCents tracks what is left to allocate', () => {
    assert.strictEqual(m.remainingCents(-71.95, [{ amount: 55.45 }, { amount: '' }]), 1650);
    assert.strictEqual(m.remainingCents(-71.95, [{ amount: 55.45 }, { amount: 16.5 }]), 0);
    assert.strictEqual(m.remainingCents(-71.95, [{ amount: 80 }]), -805);
  });

  await test('validateSplits accepts parts that sum exactly to the original magnitude', () => {
    const r = m.validateSplits('-71.95', [
      { amount: '55.45', category_group: 'Shopping' },
      { amount: 16.5, category_group: 'Food & Dining', category: 'Groceries', hidden: 1 },
    ]);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.parts, [
      { amount: 55.45, category_group: 'Shopping', category: null, hidden: false },
      { amount: 16.5, category_group: 'Food & Dining', category: 'Groceries', hidden: true },
    ]);
  });

  await test('validateSplits rejects sums that are short or over, with the gap', () => {
    const short = m.validateSplits(-71.95, [{ amount: 50, category_group: 'Shopping' }, { amount: 20, category_group: 'Other' }]);
    assert.strictEqual(short.ok, false);
    assert.match(short.error, /\$1\.95 short/);
    const over = m.validateSplits(71.95, [{ amount: 50, category_group: 'Shopping' }, { amount: 22, category_group: 'Other' }]);
    assert.match(over.error, /\$0\.05 over/);
  });

  await test('validateSplits flags invalid parts individually', () => {
    const r = m.validateSplits(-20, [{ amount: 20, category_group: 'Shopping' }, { amount: '0', category_group: 'Other' }]);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.partErrors[1], 'Amount must be a valid number above $0.');
    const noCat = m.validateSplits(-20, [{ amount: 10, category_group: 'Shopping' }, { amount: 10, category_group: ' ' }]);
    assert.strictEqual(noCat.partErrors[1], 'Choose a category.');
    const neg = m.validateSplits(-20, [{ amount: 30, category_group: 'A' }, { amount: -10, category_group: 'B' }]);
    assert.strictEqual(neg.ok, false);
  });

  await test('validateSplits enforces part counts and a non-zero total', () => {
    assert.strictEqual(m.validateSplits(-10, [{ amount: 10, category_group: 'A' }]).ok, false);
    assert.strictEqual(m.validateSplits(0, [{ amount: 0, category_group: 'A' }, { amount: 0, category_group: 'B' }]).ok, false);
    const many = Array.from({ length: m.MAX_SPLITS + 1 }, () => ({ amount: 1, category_group: 'A' }));
    assert.strictEqual(m.validateSplits(m.MAX_SPLITS + 1, many).ok, false);
    assert.strictEqual(m.validateSplits(-10, 'nope').ok, false);
  });

  await test('effectiveTransactions drops hidden rows and expands splits with the original sign', () => {
    const rows = [
      { id: 1, amount: '-71.95', post_date: '2026-11-12', category_group: 'Shopping', description: 'Kmart',
        splits: [
          { amount: '55.45', category_group: 'Shopping', category: null, hidden: false },
          { amount: '16.50', category_group: 'Food & Dining', category: 'Groceries', hidden: false },
        ] },
      { id: 2, amount: -10, category_group: 'Other', hidden: true },
      { id: 3, amount: 3650, category_group: 'Income' },
      { id: 4, amount: -30, category_group: 'Shopping', splits: [
        { amount: 20, category_group: 'Shopping', hidden: false },
        { amount: 10, category_group: 'Gifts & Donations', hidden: true },
      ] },
    ];
    const out = m.effectiveTransactions(rows);
    assert.deepStrictEqual(out.map((r) => [r.id, r.amount, r.category_group]), [
      ['1:s1', -55.45, 'Shopping'],
      ['1:s2', -16.5, 'Food & Dining'],
      [3, 3650, 'Income'],
      ['4:s1', -20, 'Shopping'],
    ]);
    assert.strictEqual(out[0].split_of, 1);
    assert.strictEqual(out[0].post_date, '2026-11-12');
    // Untouched rows are passed through by reference.
    assert.strictEqual(out[2], rows[2]);
  });

  await test('effectiveTransactions passes rows without the new fields through', () => {
    const rows = [{ id: 'a', amount: -5 }, { id: 'b', amount: -6, splits: [] }];
    assert.deepStrictEqual(m.effectiveTransactions(rows), rows);
    assert.deepStrictEqual(m.effectiveTransactions(null), []);
  });

  console.log('\ntransaction-detail input validation');
  const d = require('../lib/transaction-detail');

  await test('validateMetaPatch accepts booleans and trims text; empty text clears', () => {
    assert.deepStrictEqual(d.validateMetaPatch({ hidden: true, note: '  Work  lunch ', merchant_name: '' }).patch,
      { hidden: true, note: 'Work lunch', merchant_name: null });
    assert.ok(d.validateMetaPatch({ hidden: 'yes' }).error);
    assert.ok(d.validateMetaPatch({ note: 'x'.repeat(501) }).error);
    assert.ok(d.validateMetaPatch({ note: 5 }).error);
    assert.ok(d.validateMetaPatch({}).error);
  });

  await test('validateTag requires a name and a known colour', () => {
    assert.deepStrictEqual(d.validateTag({ name: ' Work trip ', color: 'sky' }).tag, { name: 'Work trip', color: 'sky' });
    assert.strictEqual(d.validateTag({ name: 'Tax' }).tag.color, 'sand');
    assert.ok(d.validateTag({ name: '' }).error);
    assert.ok(d.validateTag({ name: 'A', color: '#ff0000' }).error);
    assert.ok(d.validateTag({ name: 'x'.repeat(41) }).error);
  });

  await test('validateBulkEdit validates ids, category, meta and tags', () => {
    const ok = d.validateBulkEdit({ ids: [5, '5', '12'], changes: { category: { category_group: 'Shopping' }, reviewed: true, add_tag_ids: ['3'] } });
    assert.deepStrictEqual(ok, { ids: ['5', '12'], changes: { category: { category_group: 'Shopping', category: null }, reviewed: true, add_tag_ids: ['3'] } });
    assert.deepStrictEqual(d.validateBulkEdit({ ids: [1], changes: { category: null } }).changes, { category: null });
    assert.ok(d.validateBulkEdit({ ids: [], changes: { hidden: true } }).error);
    assert.ok(d.validateBulkEdit({ ids: ['1; DROP'], changes: { hidden: true } }).error);
    assert.ok(d.validateBulkEdit({ ids: [1], changes: { category: { category_group: 'Nope' } } }).error);
    assert.ok(d.validateBulkEdit({ ids: [1], changes: {} }).error);
    assert.ok(d.validateBulkEdit({ ids: [1], changes: { add_tag_ids: [1], set_tag_ids: [2] } }).error);
    assert.ok(d.validateBulkEdit({ ids: Array.from({ length: 201 }, (_, i) => i + 1), changes: { hidden: true } }).error);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
