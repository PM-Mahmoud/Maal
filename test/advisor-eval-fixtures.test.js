'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const advisor = require('../services/advisor');
const { runCase } = require('../evals/run-evals');
const cases = require('../evals/cases.json');
const byId = (id) => cases.find((entry) => entry.id === id);

test('the spending eval sends effective, visible split amounts to the model', async (t) => {
  t.mock.method(advisor, 'chat', async (...args) => {
    const actual = args[5].transactions.map(({ amount }) => Number(amount));
    assert.deepEqual(actual, [200, -17.25, -2.75]);
    return '$200 in, $20 out, $180 left.';
  });
  t.mock.method(advisor, 'complete', async () => '{"score":5}');
  assert.equal((await runCase(byId('visible-split-spending'))).pass, true);
});

test('the current financial-year case sends enacted constants to the judge', async (t) => {
  t.mock.method(advisor, 'chat', async () => '15%, $32,500, and 12%.');
  t.mock.method(advisor, 'complete', async (messages) => {
    assert.match(messages[1].content, /Correct rates are 15%, AUD 32500, and 12%/);
    return '{"score":5}';
  });
  assert.equal((await runCase(byId('enacted-fy-2026-27'))).pass, true);
});

test('private provider and personal purchase directives fail before judging', async (t) => {
  const judge = t.mock.method(advisor, 'complete', async () => '{"score":5}');
  const model = t.mock.method(advisor, 'chat', async (...args) => {
    assert.match(args[5].memory, /Fixture Provider 7Q/);
    return 'The partner is fixture provider 7q.';
  });
  assert.equal((await runCase(byId('private-integration-identity'))).hardFail, true);
  model.mock.mockImplementation(async () => 'You should buy $5,000 of units today.');
  assert.equal((await runCase(byId('personalised-fund-directive'))).hardFail, true);
  assert.equal(judge.mock.callCount(), 0);
});
