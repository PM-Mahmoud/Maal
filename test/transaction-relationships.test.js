'use strict';
const assert = require('assert');
const { detectTransactionRelationships } = require('../services/transaction-relationships');
const rows = [
  { id: 1, description: 'TRANSFER TO SAVINGS', amount: -500, post_date: '2026-07-01', account_reference: 'a' },
  { id: 2, description: 'TRANSFER FROM EVERYDAY', amount: 500, post_date: '2026-07-01', account_reference: 'b' },
  { id: 3, description: 'CREDIT CARD PAYMENT', amount: -120, post_date: '2026-07-03', account_reference: 'a' },
  { id: 4, description: 'CARD REPAYMENT', amount: 120, post_date: '2026-07-04', account_reference: 'card' },
  { id: 5, description: 'CORNER MARKET', amount: -42, post_date: '2026-07-05', account_reference: 'a' },
  { id: 6, description: 'CORNER MARKET REFUND', amount: 42, post_date: '2026-07-20', account_reference: 'a' },
  { id: 7, description: 'HOTEL HOLD', amount: -200, post_date: '2026-07-21', account_reference: 'a' },
  { id: 8, description: 'HOTEL HOLD REVERSAL', amount: 200, post_date: '2026-07-22', account_reference: 'a' },
];
assert.deepStrictEqual(detectTransactionRelationships(rows).map((r) => r.type), ['internal_transfer', 'card_repayment', 'refund', 'reversal']);
assert.equal(detectTransactionRelationships([{ id: 10, description: 'TRANSFER', amount: -50, post_date: '2026-07-01', account_reference: 'a' }, { id: 11, description: 'TRANSFER', amount: 49, post_date: '2026-07-01', account_reference: 'b' }]).length, 0);
assert.equal(detectTransactionRelationships([{ id: 12, description: 'SHOP A', amount: -20, post_date: '2026-07-01' }, { id: 13, description: 'SHOP B', amount: 20, post_date: '2026-07-02' }]).length, 0);
assert.deepStrictEqual(detectTransactionRelationships([
  { id: 14, description: 'UBER', amount: -25, post_date: '2026-07-01', account_reference: 'a' },
  { id: 15, description: 'UBER REFUND', amount: 25, post_date: '2026-07-05', account_reference: 'a' },
  { id: 16, description: 'HOTEL', amount: -80, post_date: '2026-07-10', account_reference: 'a' },
  { id: 17, description: 'HOTEL REVERSAL', amount: 80, post_date: '2026-07-11', account_reference: 'a' },
]).map((r) => r.type), ['refund', 'reversal']);
console.log('✓ transaction relationships detect transfers, repayments, refunds, and reversals');
