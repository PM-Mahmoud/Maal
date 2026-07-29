const assert = require('assert');
const { normalizeImportedTransaction } = require('../lib/transaction-import');

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

console.log(`\n${passed} transaction-import tests passed`);
