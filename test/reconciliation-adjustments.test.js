const assert = require('assert');
const {
  applyAdjustment,
  createAdjustmentHandler,
  createListAdjustmentsHandler,
} = require('../services/reconciliation');

const adjusted = applyAdjustment({
  account_reference: 'basiq:everyday',
  provider_balance: 125,
  calculated_balance: 120,
  difference: 5,
  status: 'mismatch',
}, { amount: 5, id: 11, reason: 'Opening balance correction' });
assert.deepStrictEqual(adjusted, {
  account_reference: 'basiq:everyday',
  provider_balance: 125,
  calculated_balance: 120,
  difference: 0,
  status: 'matched',
  adjustment_total: 5,
  adjusted_balance: 125,
  latest_adjustment_id: 11,
});

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

(async () => {
  let created;
  const handler = createAdjustmentHandler({
    createAdjustment: async (userId, input) => {
      created = { userId, ...input };
      return { id: 21, ...input };
    },
  });

  const unauthenticated = response();
  await handler({ session: {}, params: {}, body: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const invalid = response();
  await handler({
    session: { userId: 7 }, params: { accountReference: 'basiq:everyday' },
    body: { amount: '', reason: 'Correction' },
  }, invalid);
  assert.equal(invalid.statusCode, 400);

  const impossibleDate = response();
  await handler({
    session: { userId: 7 }, params: { accountReference: 'basiq:everyday' },
    body: { amount: 5, reason: 'Correction', effective_at: '2026-02-30' },
  }, impossibleDate);
  assert.equal(impossibleDate.statusCode, 400);

  const valid = response();
  await handler({
    session: { userId: 7 }, params: { accountReference: 'basiq:everyday' },
    body: { amount: 5, reason: 'Opening balance correction', effective_at: '2026-08-06' },
  }, valid);
  assert.equal(valid.statusCode, 201);
  assert.deepStrictEqual(created, {
    userId: 7,
    accountReference: 'basiq:everyday',
    amount: 5,
    reason: 'Opening balance correction',
    effectiveAt: '2026-08-06',
  });
  let listedFor;
  const listHandler = createListAdjustmentsHandler({
    listAdjustments: async (userId, accountReference) => {
      listedFor = { userId, accountReference };
      return [{ id: 21, reason: 'Opening balance correction' }];
    },
  });
  const history = response();
  await listHandler({
    session: { userId: 7 }, params: { accountReference: 'basiq:everyday' },
  }, history);
  assert.deepStrictEqual(listedFor, { userId: 7, accountReference: 'basiq:everyday' });
  assert.equal(history.body.adjustments.length, 1);
  console.log('✓ reconciliation adjustments are validated and user-scoped');
})().catch((error) => { console.error(error); process.exit(1); });
