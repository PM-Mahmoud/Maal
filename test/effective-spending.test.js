'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../db/pool');
const { getTransactionsBetween } = require('../db/briefs');
const { getCashFlowTransactions } = require('../db/transactions');
const { getEffectivePayments } = require('../db/transaction-detail');
const { buildWeeklyRecap } = require('../lib/weekly-recap');
const { buildDigestModel } = require('../lib/digest');
const { calculateCashRunway } = require('../lib/spending-cashflow');
const { renderSaved } = require('../services/advisor-widgets');

const post_date = '2026-11-09';
const raw = [
  { id: '1', amount: '-70.00', category_group: 'Groceries', post_date },
  { id: '2', amount: '-50.00', category_group: 'Other', post_date },
  { id: '3', amount: '200.00', category_group: 'Income', post_date },
  { id: '4', amount: '-10.00', category_group: 'Transfers', post_date },
];
const details = [
  { transaction_id: '1', id: null, transaction_hidden: true },
  { transaction_id: '2', id: '21', position: 0, amount: '17.25', category_group: 'Groceries' },
  { transaction_id: '2', id: '22', position: 1, amount: '2.75', category_group: 'Eating Out' },
  { transaction_id: '2', id: '23', position: 2, amount: '30.00', category_group: 'Other', hidden: true },
  { transaction_id: '3', id: null, transaction_group: 'Income' },
  { transaction_id: '4', id: null, transaction_group: 'Transfers' },
];

function mockReads(t, transactions = raw, spendingDetails = details) {
  return t.mock.method(pool, 'query', async (sql, args) => {
    assert.match(sql, /WHERE t\.user_id = \$1/);
    assert.equal(args[0], 8);
    if (sql.includes('FROM transactions t') && sql.includes('transaction_splits s')) {
      assert.match(sql, /m\.user_id = \$1/);
      assert.match(sql, /c\.user_id = \$1/);
      assert.match(sql, /s\.user_id = \$1/);
      assert.deepEqual(args[1], transactions.filter((row) => row.in_window !== false).map((row) => row.id));
      return { rows: spendingDetails };
    }
    return { rows: transactions.map((row) => ({ in_window: true, ...row })) };
  });
}

test('advisor cashflow and runway use visible split amounts', async (t) => {
  mockReads(t);
  const transactions = await getCashFlowTransactions(8);
  assert.deepEqual(transactions.map(({ id, amount }) => [id, Number(amount)]), [
    ['2:s1', -17.25], ['2:s2', -2.75], ['3', 200], ['4', -10],
  ]);
  const widget = renderSaved('cashflow_summary', null, { transactions });
  assert.deepEqual(widget.data.cards.map(({ value }) => value), ['$200', '$30', '+$170']);
  assert.deepEqual(calculateCashRunway(transactions, 200, 50), { months: 10, fromTransactions: true });
  assert.deepEqual(calculateCashRunway([], 200, 50), { months: 4, fromTransactions: false });
  assert.deepEqual(calculateCashRunway([], 200, null), { months: null, fromTransactions: false });
  const digest = buildDigestModel({
    snap: { cashBalance: 200.25 }, profile: { monthly_expenses: 50 }, transactions,
  });
  assert.equal(digest.runwayMonths, 10.01);
  assert.equal(digest.runwayFromTransactions, true);
});

test('weekly recap uses split categories and counts only visible spending parts', async (t) => {
  mockReads(t);
  const now = new Date('2026-11-18T23:00:00Z');
  const transactions = await getTransactionsBetween(8, '2026-11-02', '2026-11-15');
  const { spending, cashFlow } = buildWeeklyRecap({ now, transactions });
  assert.equal(spending.total, 20);
  assert.equal(spending.count, 2);
  assert.deepEqual(spending.categories.map(({ group, amount }) => [group, amount]), [
    ['Groceries', 17.25], ['Eating Out', 2.75],
  ]);
  assert.equal(cashFlow.net, 180);
});

test('recurrence uses one payment per parent and only the visible amount', async (t) => {
  mockReads(t);
  const payments = await getEffectivePayments(8, raw);
  assert.deepEqual(payments.map(({ id, amount }) => [id, amount]), [
    ['2', -20], ['3', 200], ['4', -10],
  ]);
});

test('runway matches a transfer outside the reporting window and uses current spending categories', async (t) => {
  const rows = [
    { id: '1', amount: '-1000', description: 'Rent', category_group: 'Transfers', post_date },
    { id: '2', amount: '-9000', description: 'TFR SAVER', account_reference: 'everyday', post_date },
    { id: '3', amount: '9000', description: 'TFR SAVER', account_reference: 'saver', post_date: '2026-11-08', in_window: false },
  ];
  mockReads(t, rows, [
    { transaction_id: '1', id: null, transaction_group: 'Housing' },
    { transaction_id: '2', id: null },
  ]);
  const effective = await getCashFlowTransactions(8);
  assert.deepEqual(effective.map((row) => row.id), ['1', '2']);
  assert.equal(effective[0].category_group, 'Housing');
  assert.equal(effective[1].relationship_type, 'internal_transfer');
  assert.deepEqual(calculateCashRunway(effective, 10000, 0), { months: 10, fromTransactions: true });
});
