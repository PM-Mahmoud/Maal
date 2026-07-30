const assert = require('assert');
const {
  cashFlowLineage,
  investmentLineage,
  netWorthLineage,
  scoreLineage,
} = require('../lib/calculation-lineage');

const snapshot = {
  netWorth: 125000,
  assetsTotal: 180000,
  superBalance: 70000,
  investBalance: 45000,
  debtsTotal: 55000,
  cashBalance: 15000,
};

const netWorth = netWorthLineage(snapshot);
assert.equal(netWorth.type, 'net_worth');
assert.equal(netWorth.version, '1');
assert.deepStrictEqual(netWorth.result, { net_worth: 125000, assets_total: 180000, debts_total: 55000 });
assert.equal(netWorth.assumptions.formula, 'assets_total - debts_total');
assert.equal(netWorth.inputs.other_assets_balance, 50000);

const score = scoreLineage({
  score: 72,
  band: 'Strong',
  hasData: true,
  pillars: [{ key: 'savings', score: 80, weight: 0.25 }],
}, { annual_income: 100000, cash_savings: 15000, total_debt: 5000 });
assert.equal(score.type, 'maal_score');
assert.equal(score.result.score, 72);
assert.equal(score.inputs.annual_income, 100000);
assert.deepStrictEqual(score.assumptions.weights, { savings: 0.25 });

const cashFlow = cashFlowLineage([
  { id: 1, amount: '2500', status: 'posted', post_date: new Date('2026-07-01T00:00:00Z') },
  { id: 2, amount: '-900.25', status: 'posted', post_date: '2026-07-02' },
  { id: 3, amount: '-50', status: 'pending', post_date: '2026-07-03' },
], 30);
assert.deepStrictEqual(cashFlow.result, { inflow: 2500, outflow: 900.25, net_cash_flow: 1599.75 });
assert.deepStrictEqual(cashFlow.inputs.transactions.map((row) => row.id), [1, 2]);
assert.equal(cashFlow.inputs.transactions[0].post_date, '2026-07-01');
assert.equal(cashFlow.assumptions.pending_transactions, 'excluded');
assert.deepStrictEqual(
  cashFlowLineage([
    { id: 2, amount: 10, post_date: '2026-07-02' },
    { id: 1, amount: null, post_date: '2026-07-01' },
    { id: 3, amount: '', post_date: '2026-07-03' },
  ]).inputs.transactions.map((row) => row.id),
  [2]
);

const investment = investmentLineage([
  { id: 8, name: 'ETF', value: '30000', cost_basis: '25000', currency: 'AUD' },
  { id: 9, name: 'Shares', value: 15000, cost_basis: 12000, currency: 'AUD' },
]);
assert.deepStrictEqual(investment.result, {
  current_value: 45000,
  cost_basis: 37000,
  unrealised_gain: 8000,
  unrealised_return_pct: 21.62,
  coverage: 'complete',
});
assert.deepStrictEqual(investment.inputs.investments.map((row) => row.id), [8, 9]);
const mixedCurrency = investmentLineage([
  { id: 1, value: 100, cost_basis: 80, currency: 'AUD' },
  { id: 2, value: 100, cost_basis: 80, currency: 'USD' },
]);
assert.equal(mixedCurrency.result.current_value, 100);
assert.equal(mixedCurrency.result.coverage, 'incomplete');
assert.deepStrictEqual(mixedCurrency.inputs.excluded_holdings, [{
  id: 2, currency: 'USD', reason: 'fx_rate_unavailable',
}]);

console.log('✓ calculation lineage descriptors are deterministic and explainable');
