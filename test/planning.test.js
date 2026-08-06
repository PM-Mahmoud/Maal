const test = require('node:test');
const assert = require('node:assert/strict');
const { goalFeasibility, emergencyFund, debtPayoff, buildPlanningSummary } = require('../lib/planning');

test('goal feasibility calculates required contribution and status', () => {
  const result = goalFeasibility({ target_amount: 20000, current_amount: 8000, target_date: '2027-08-07' }, { asOf: '2026-08-07', monthlyContribution: 1000 });
  assert.equal(result.months_remaining, 12); assert.equal(result.required_monthly_contribution, 1000); assert.equal(result.status, 'on_track');
});
test('past and completed goals remain valid', () => {
  assert.equal(goalFeasibility({ target_amount: 1000, current_amount: 1000, target_date: '2025-01-01' }, { asOf: '2026-08-07' }).status, 'achieved');
  assert.equal(goalFeasibility({ target_amount: 1000, current_amount: 0, target_date: '2025-01-01' }, { asOf: '2026-08-07' }).status, 'overdue');
});
test('goal without a target date asks for one instead of claiming it is on track', () => {
  assert.equal(goalFeasibility({ target_amount: 1000, current_amount: 100 }, { asOf: '2026-08-07' }).status, 'needs_target_date');
});
test('emergency fund reports coverage and target gap', () => {
  const result = emergencyFund({ cash: 9000, monthlyEssentialExpenses: 3000, targetMonths: 6 });
  assert.equal(result.coverage_months, 3); assert.equal(result.target_amount, 18000); assert.equal(result.gap, 9000);
});
test('avalanche saves interest relative to snowball', () => {
  const debts = [{ id: 1, label: 'Card', balance: 5000, interest_rate: 20, min_payment: 150 }, { id: 2, label: 'Loan', balance: 2000, interest_rate: 5, min_payment: 80 }];
  const avalanche = debtPayoff(debts, { strategy: 'avalanche', extraMonthly: 300, asOf: '2026-08-07' });
  const snowball = debtPayoff(debts, { strategy: 'snowball', extraMonthly: 300, asOf: '2026-08-07' });
  assert.ok(avalanche.total_interest <= snowball.total_interest); assert.ok(avalanche.months_to_debt_free > 0); assert.equal(avalanche.schedule.at(-1).closing_balance, 0);
});
test('custom order is honoured and summary exposes outcomes', () => {
  const debts = [{ id: 1, balance: 1000, interest_rate: 10, min_payment: 50 }, { id: 2, balance: 1000, interest_rate: 10, min_payment: 50 }];
  assert.equal(debtPayoff(debts, { strategy: 'custom', customOrder: [2, 1], extraMonthly: 100, asOf: '2026-08-07' }).payoff_order[0].id, 2);
  const summary = buildPlanningSummary({ goals: [], cash: 1000, monthlyEssentialExpenses: 500, debts, extraDebtPayment: 100, asOf: '2026-08-07' });
  assert.equal(summary.emergency_fund.coverage_months, 2); assert.equal(summary.debt_plans.length, 3); assert.ok(summary.outcomes.projected_debt_free_date);
});
test('an explicit zero contribution is preserved in the summary', () => {
  const summary = buildPlanningSummary({ goals: [{ id: 7, target_amount: 1200, current_amount: 0, target_date: '2027-08-07', monthly_contribution: 100 }], goalContributions: { 7: 0 }, asOf: '2026-08-07' });
  assert.equal(summary.goals[0].planned_monthly_contribution, 0);
  assert.equal(summary.goals[0].status, 'behind');
});
