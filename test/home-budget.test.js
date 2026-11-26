'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('Home shows month-to-date spend and ranks the three largest category overruns', async () => {
  const { homeBudgetSummary } = await import('../shared/home-budget.mjs');
  const today = new Date(2026, 10, 18);
  const transactions = [
    { id: 'housing', post_date: '2026-11-01', amount: -150, category_group: 'Housing' },
    { id: 'split', post_date: '2026-11-02', amount: -100, splits: [
      { amount: 55.75, category_group: 'Groceries' },
      { amount: 34.25, category_group: 'Shopping' },
      { amount: 10, hidden: true },
    ] },
    { id: 'entertainment', post_date: '2026-11-03', amount: -9, category_group: 'Entertainment' },
    { id: 'hidden', post_date: '2026-11-04', amount: -1000, hidden: true },
    { id: 'transfer', post_date: '2026-11-05', amount: -1000, relationship_type: 'internal_transfer' },
    { id: 'excluded', post_date: '2026-11-06', amount: -1000, category_group: 'Exclude this' },
    { id: 'last-month', post_date: '2026-10-17', amount: -1000, category_group: 'Housing' },
    { id: 'future', post_date: '2026-11-20', amount: -1000, category_group: 'Housing' },
  ];
  const budgets = [
    { category_group: null, monthly_amount: 200 },
    { category_group: 'Housing', monthly_amount: 100 },
    { category_group: 'Groceries', monthly_amount: 25 },
    { category_group: 'Shopping', monthly_amount: 20 },
    { category_group: 'Entertainment', monthly_amount: 8 },
  ];
  assert.deepEqual(homeBudgetSummary({ transactions, budgets, total: 200, excluded: ['Exclude this'], today }), {
    budget: 200,
    spent: 249,
    overBudget: [
      { group: 'Housing', over: 50 },
      { group: 'Groceries', over: 30.75 },
      { group: 'Shopping', over: 14.25 },
    ],
  });
});

test('Home distinguishes no configured budget from a configured budget with no spending', async () => {
  const { homeBudgetSummary } = await import('../shared/home-budget.mjs');
  assert.equal(homeBudgetSummary({ transactions: [], budgets: [], total: 0 }), null);
  assert.deepEqual(homeBudgetSummary({ transactions: [], budgets: [], total: 250 }), {
    budget: 250, spent: 0, overBudget: [],
  });
});
