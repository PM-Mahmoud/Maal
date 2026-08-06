'use strict';
const assert = require('assert');
const { detectRecurringTransactions } = require('../services/transaction-rules');
const recurring = detectRecurringTransactions([
  { id: 1, description: 'ACME PAYROLL', amount: 5000, post_date: '2026-05-01' },
  { id: 2, description: 'ACME PAYROLL', amount: 5100, post_date: '2026-06-01' },
  { id: 3, description: 'ACME PAYROLL', amount: 5050, post_date: '2026-07-01' },
  { id: 4, description: 'AGL ENERGY', amount: -180, post_date: '2026-05-05' },
  { id: 5, description: 'AGL ENERGY', amount: -205, post_date: '2026-06-05' },
  { id: 6, description: 'AGL ENERGY', amount: -195, post_date: '2026-07-05' },
  { id: 7, description: 'NETFLIX', amount: -18.99, post_date: '2026-05-10', category_group: 'Recurring & Subscriptions' },
  { id: 8, description: 'NETFLIX', amount: -18.99, post_date: '2026-06-10', category_group: 'Recurring & Subscriptions' },
  { id: 9, description: 'NETFLIX', amount: -18.99, post_date: '2026-07-10', category_group: 'Recurring & Subscriptions' },
], { now: '2026-08-06' });
assert.deepStrictEqual(recurring.map((item) => item.kind).sort(), ['bill', 'income', 'subscription']);
assert.equal(recurring.find((item) => item.kind === 'bill').averageAmount, 193.33);
assert.equal(recurring.find((item) => item.kind === 'income').nextEstimate, '2026-07-31');
assert.equal(detectRecurringTransactions([
  { description: 'RANDOM', amount: -10, post_date: '2026-01-01' },
  { description: 'RANDOM', amount: -100, post_date: '2026-02-01' },
  { description: 'RANDOM', amount: -20, post_date: '2026-03-01' },
], { now: '2026-03-15' }).length, 0, 'highly variable amounts are not recurring obligations');
assert.equal(detectRecurringTransactions([
  { description: 'IRREGULAR', amount: -20, post_date: '2026-01-01' },
  { description: 'IRREGULAR', amount: -20, post_date: '2026-01-02' },
  { description: 'IRREGULAR', amount: -20, post_date: '2026-02-01' },
], { now: '2026-02-10' }).length, 0, 'irregular gaps must not pass on median alone');
assert.equal(detectRecurringTransactions([
  { description: 'OLD SERVICE', amount: -20, post_date: '2024-01-01' },
  { description: 'OLD SERVICE', amount: -20, post_date: '2024-02-01' },
  { description: 'OLD SERVICE', amount: -20, post_date: '2024-03-01' },
], { now: '2026-08-06' }).length, 0, 'inactive history must not inflate current totals');
assert.equal(detectRecurringTransactions([
  { description: 'TRANSFER', amount: -50, post_date: '2026-06-01', relationship_type: 'internal_transfer' },
  { description: 'TRANSFER', amount: -50, post_date: '2026-07-01', relationship_type: 'internal_transfer' },
  { description: 'TRANSFER', amount: -50, post_date: '2026-08-01', relationship_type: 'internal_transfer' },
], { now: '2026-08-06' }).length, 0, 'relationships are excluded from recurring spend');
console.log('✓ recurring income, bills, and subscriptions are classified');
