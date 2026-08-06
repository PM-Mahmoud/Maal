const assert = require('assert');
const {
  createListReconciliationsHandler,
  createReconciliationService,
} = require('../services/reconciliation');

(async () => {
  let saved;
  const reconcile = createReconciliationService({
    loadReconciliationInputs: async (userId) => {
      assert.equal(userId, 7);
      return {
        accounts: [
          { account_reference: 'basiq:a1', balance: 120 },
          { account_reference: 'basiq:a2', balance: 50 },
        ],
        transactions: [
          { account_reference: 'basiq:a1', transaction_id: 1, amount: 10, balance_after: 100, post_date: '2026-07-01' },
          { account_reference: 'basiq:a1', transaction_id: 2, amount: 20, balance_after: 120, post_date: '2026-07-02' },
        ],
      };
    },
    listAdjustments: async () => [],
    saveReconciliations: async (userId, results, tolerance) => { saved = { userId, results, tolerance }; },
  });
  const results = await reconcile(7);
  assert.deepStrictEqual(results.map((row) => row.status), ['matched', 'insufficient_data']);
  assert.equal(saved.userId, 7);
  assert.equal(saved.tolerance, 0.01);
  assert.deepStrictEqual(saved.results, results);

  const incompleteResults = await reconcile(7, { evidenceComplete: false });
  assert.deepStrictEqual(
    incompleteResults.map((row) => row.status),
    ['insufficient_data', 'insufficient_data']
  );

  let queriedUserId;
  const handler = createListReconciliationsHandler({
    listReconciliations: async (userId) => {
      queriedUserId = userId;
      return [{ account_reference: 'basiq:owned' }];
    },
  });
  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const unauthenticated = response();
  await handler({ session: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const authenticated = response();
  await handler({ session: { userId: 91 } }, authenticated);
  assert.equal(queriedUserId, 91);
  assert.deepStrictEqual(authenticated.body, {
    reconciliations: [{ account_reference: 'basiq:owned' }],
  });
  console.log('✓ reconciliation service groups transactions by user-scoped account');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
