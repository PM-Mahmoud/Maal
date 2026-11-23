'use strict';

const { autoCategorize } = require('./transaction-categories');

const NON_SPEND_GROUPS = new Set(['Transfers', 'Credit Card Payments', 'Savings & Investments']);

function calculateCashRunway(transactions, cash, statedMonthlyExpenses) {
  let spendingCents = 0;
  for (const row of transactions) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount >= 0) continue;
    const group = row.category_group || autoCategorize(row.description, amount)?.group;
    if (!NON_SPEND_GROUPS.has(group)) spendingCents += Math.round(-amount * 100);
  }
  const fromTransactions = spendingCents > 0;
  const monthlyExpenses = fromTransactions ? spendingCents / 100 : Number(statedMonthlyExpenses);
  const balance = Number(cash);
  return {
    months: monthlyExpenses > 0 ? (Number.isFinite(balance) ? balance : 0) / monthlyExpenses : null,
    fromTransactions,
  };
}

module.exports = { calculateCashRunway, NON_SPEND_GROUPS };
