const assert = require('assert');
const { normalizeImportedTransaction, resolveClientCategory } = require('../lib/transaction-import');
const { isKnownGroup, isValidCategory } = require('../lib/transaction-categories');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓', name);
}

test('normalizes the existing CSV request shape into database columns', () => {
  assert.deepStrictEqual(normalizeImportedTransaction({
    occurred_on: '2026-07-30',
    description: '  Groceries  ',
    amount: '-42.50',
    category: 'other',
  }), {
    description: 'Groceries',
    amount: -42.5,
    status: null,
    post_date: '2026-07-30',
  });
});

test('rejects invalid rows before any financial write', () => {
  assert.throws(
    () => normalizeImportedTransaction({ occurred_on: '2026-02-30', description: 'Bad', amount: 1 }),
    /valid YYYY-MM-DD/
  );
  assert.throws(
    () => normalizeImportedTransaction({ occurred_on: '2026-07-30', description: 'Bad', amount: '' }),
    /amount/
  );
  assert.throws(
    () => normalizeImportedTransaction({ occurred_on: '2026-07-30', description: ' ', amount: 1 }),
    /description/
  );
});

test('maps a manual add category to a valid taxonomy assignment', () => {
  assert.deepStrictEqual(resolveClientCategory('groceries'), {
    category_group: 'Food & Dining', category: 'Groceries',
  });
  assert.deepStrictEqual(resolveClientCategory('investing'), {
    category_group: 'Savings & Investments', category: 'Investment',
  });
  // Group-only mapping (no sub-category) is still valid taxonomy.
  assert.deepStrictEqual(resolveClientCategory('housing'), {
    category_group: 'Housing', category: null,
  });
});

test('every mapped client category resolves to a real taxonomy group/category', () => {
  const CATS = ['groceries', 'dining', 'transport', 'housing', 'utilities',
    'health', 'income', 'investing', 'savings', 'entertainment'];
  for (const c of CATS) {
    const a = resolveClientCategory(c);
    assert.ok(a, `expected an assignment for "${c}"`);
    assert.ok(isKnownGroup(a.category_group), `unknown group for "${c}": ${a.category_group}`);
    assert.ok(isValidCategory(a.category_group, a.category),
      `invalid category for "${c}": ${a.category_group}/${a.category}`);
  }
});

test('CSV import default "other" (and unknown/absent) persists NO manual category', () => {
  // CSV import always sends category:"other" — it must fall through to
  // auto-categorisation for display, not overwrite it with a manual "Other" row.
  assert.strictEqual(resolveClientCategory('other'), null);
  assert.strictEqual(resolveClientCategory('OTHER'), null);
  assert.strictEqual(resolveClientCategory('uncategorised'), null);
  assert.strictEqual(resolveClientCategory(undefined), null);
  assert.strictEqual(resolveClientCategory(null), null);
  assert.strictEqual(resolveClientCategory(''), null);
  assert.strictEqual(resolveClientCategory('not-a-real-category'), null);
});

test('a full CSV row maps to the correct transactions columns (category handled separately)', () => {
  const csvRow = { occurred_on: '2026-08-01', description: 'BP Fuel', amount: -63.2, category: 'other' };
  assert.deepStrictEqual(normalizeImportedTransaction(csvRow), {
    description: 'BP Fuel', amount: -63.2, status: null, post_date: '2026-08-01',
  });
  assert.strictEqual(resolveClientCategory(csvRow.category), null);
});

console.log(`\n${passed} transaction-import tests passed`);
