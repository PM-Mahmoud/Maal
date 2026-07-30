const assert = require('assert');
const {
  createCalculationLineageService,
  createListLineageHandler,
} = require('../services/calculation-lineage');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  let query;
  const handler = createListLineageHandler({
    listCalculationLineage: async (userId, options) => {
      query = { userId, options };
      return [{ calculation_type: 'net_worth' }];
    },
  });
  const unauthenticated = response();
  await handler({ session: {}, query: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const invalidType = response();
  await handler({ session: { userId: 4 }, query: { type: 'other' } }, invalidType);
  assert.equal(invalidType.statusCode, 400);
  const authenticated = response();
  await handler(
    { session: { userId: 42 }, query: { type: 'net_worth', limit: '10' } },
    authenticated
  );
  assert.deepStrictEqual(query, {
    userId: 42,
    options: { type: 'net_worth', limit: '10' },
  });
  assert.deepStrictEqual(authenticated.body, {
    calculations: [{ calculation_type: 'net_worth' }],
  });

  const recorded = [];
  const lineage = createCalculationLineageService({
    recordCalculation: async (userId, calculation) => {
      recorded.push({ userId, calculation });
      return recorded.length;
    },
  });
  await lineage.recordScoreMetric(
    42,
    { score: 70, band: 'Strong', pillars: [], hasData: true },
    { annual_income: 100000 }
  );
  await lineage.recordSnapshotMetrics(42, {
    snapshot: {
      netWorth: 90, assetsTotal: 100, debtsTotal: 10,
      cashBalance: 20, investBalance: 30, superBalance: 40,
    },
    transactions: [{ id: 1, amount: 10, status: 'posted', post_date: '2026-07-01' }],
    investments: [{ id: 2, value: 30, cost_basis: 20, currency: 'AUD' }],
  });
  assert.deepStrictEqual(
    recorded.map((row) => row.calculation.type),
    ['maal_score', 'net_worth', 'cash_flow', 'investment_metrics']
  );
  assert(recorded.every((row) => row.userId === 42));
  console.log('✓ calculation lineage API handler is authenticated and user-scoped');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
