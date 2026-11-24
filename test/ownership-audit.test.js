'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const owner = 17;
const recordId = 28;
const calls = [];
let result = { rows: [], rowCount: 0 };
global.__maalPool = { query: async (sql, params) => {
  calls.push({ sql, params });
  return result;
} };

const onboarding = require('../db/onboarding');
const advisor = require('../db/advisor');
const radar = require('../db/radar');
const linked = require('../db/linked_accounts');
const recurring = require('../db/recurring-items');
const research = require('../db/research');
const onboardingRouter = require('../routes/onboarding');

function assertOwnerBinding() {
  const { sql, params } = calls.at(-1);
  const predicate = sql.match(/\buser_id\s*=\s*\$(\d+)/);
  assert.ok(predicate, 'SQL operation must have an explicit owner predicate');
  assert.equal(params[Number(predicate[1]) - 1], owner);
}

test('onboarding store binds the caller to every session and answer operation', async () => {
  result = { rows: [], rowCount: 0 };
  assert.equal(await onboarding.getResponseByStep(recordId, owner, 1), null);
  assertOwnerBinding();
  assert.deepEqual(await onboarding.getResponsesBySession(recordId, owner), []);
  assertOwnerBinding();
  assert.equal(await onboarding.getFullProfileByUserId(owner), null);
  assertOwnerBinding();
  await onboarding.markResponseComplete(recordId, owner);
  assertOwnerBinding();
  await onboarding.updateSessionStep(recordId, owner, 2);
  assertOwnerBinding();
  assert.equal(await onboarding.completeSession(recordId, owner), false);
  assertOwnerBinding();
  assert.equal(await onboarding.upsertResponse(recordId, owner, 1, { role: 'Analyst' }), null);
  assertOwnerBinding();
});

test('onboarding routes require a signed-in session and stop after an unmatched owner', async () => {
  for (const path of ['/session/:sessionId/step/:step', '/step/:step', '/complete']) {
    const route = onboardingRouter.stack.find((layer) => layer.route?.path === path).route;
    let resultStatus;
    const res = {
      redirect: () => { resultStatus = 302; },
      status: (code) => { resultStatus = code; return res; },
      json: () => {},
    };
    route.stack[0].handle({ session: {}, originalUrl: '/onboarding' }, res, () => {
      assert.fail('blocked sessions must not proceed');
    });
    assert.equal(resultStatus, 302);

    if (path === '/session/:sessionId/step/:step') continue;
    const checksBefore = calls.length;
    await route.stack[1].handle({
      session: { userId: owner }, params: { step: '1' }, body: { session_id: recordId },
    }, res);
    assert.equal(resultStatus, 404);
    assert.equal(calls.length, checksBefore + 1);
    assertOwnerBinding();
  }
});

test('associated rows and worker writes bind their owner in SQL', async () => {
  result = { rows: [], rowCount: 0 };
  const operations = [
    () => advisor.appendMessage(recordId, owner, 'user', 'Hello'),
    () => radar.recordRun(recordId, owner, { result: 'Done', alerted: false }),
    () => radar.logEvent(recordId, owner, false, 'Done'),
    () => research.completeReport(recordId, owner, 'Done', []),
    () => research.failReport(recordId, owner, 'Failed'),
    () => research.setJobPhase(recordId, owner, 'gather'),
    () => research.completeJob(recordId, owner, recordId, {}),
    () => research.failJob(recordId, owner, 'Failed'),
    () => linked.updateAccountStatus(recordId, owner, 'active'),
    () => recurring.createRecurringItem(owner, { transaction_id: String(recordId) }),
  ];
  for (const operation of operations) {
    await operation();
    assertOwnerBinding();
  }
});
