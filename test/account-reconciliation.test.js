const assert = require('assert');
const { calculateReconciliation } = require('../lib/account-reconciliation');

const account = { account_reference: 'basiq:a1', balance: 125 };
assert.deepStrictEqual(calculateReconciliation(account, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 10, balance_after: 100 },
  { transaction_id: 2, post_date: '2026-07-02', amount: 20, balance_after: 120 },
  { transaction_id: 3, post_date: '2026-07-03', amount: 5, balance_after: 125 },
]), {
  account_reference: 'basiq:a1', provider_balance: 125, calculated_balance: 125,
  difference: 0, status: 'matched', transaction_count: 3, anchor_transaction_id: 1,
});
assert.equal(calculateReconciliation({ ...account, balance: 140 }, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 10, balance_after: 100 },
  { transaction_id: 2, post_date: '2026-07-02', amount: 20, balance_after: 120 },
]).status, 'mismatch');
assert.equal(calculateReconciliation(account, []).status, 'insufficient_data');
assert.equal(calculateReconciliation(account, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 1, balance_after: null },
]).status, 'insufficient_data');
assert.equal(calculateReconciliation({ ...account, balance: 125.01 }, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 1, balance_after: 125 },
]).status, 'matched');
assert.equal(calculateReconciliation({ ...account, balance: 125.02 }, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 1, balance_after: 125 },
]).status, 'mismatch');
const missingLaterBalance = calculateReconciliation(account, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 10, balance_after: 100 },
  { transaction_id: 2, post_date: '2026-07-02', amount: 25, balance_after: null },
]);
assert.equal(missingLaterBalance.calculated_balance, 125);
assert.equal(missingLaterBalance.status, 'matched');
assert.equal(missingLaterBalance.transaction_count, 2);
assert.equal(calculateReconciliation(account, [
  {
    transaction_id: 2, post_date: '2026-07-01', provider_posted_at: '2026-07-01T08:00:00Z',
    amount: 25, balance_after: 125,
  },
  {
    transaction_id: 1, post_date: '2026-07-01', provider_posted_at: '2026-07-01T07:00:00Z',
    amount: 10, balance_after: 100,
  },
]).status, 'matched');
assert.equal(calculateReconciliation(account, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 10, balance_after: 100 },
  { transaction_id: 2, post_date: '2026-07-01', amount: 25, balance_after: 125 },
]).status, 'insufficient_data');
assert.equal(calculateReconciliation(account, [
  { transaction_id: 1, post_date: '2026-07-01', amount: 10, balance_after: 100 },
  { transaction_id: 2, post_date: '2026-07-02', amount: null, balance_after: null },
]).status, 'insufficient_data');
console.log('✓ 10 account reconciliation tests passed');
