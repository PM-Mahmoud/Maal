'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { retryBorderlineCase } = require('../evals/run-evals');

const cases = Array.from({ length: 8 }, (_, id) => ({ id }));
function initialResults(miss) {
  return [...cases.slice(0, -1).map(({ id }) => ({ id, pass: true })), { id: 7, pass: false, ...miss }];
}

test('a sole borderline miss reruns only that case once', async () => {
  const results = initialResults({ score: 3 });
  let calls = 0;
  await retryBorderlineCase(cases, results, async (c) => {
    calls += 1;
    assert.equal(c.id, 7);
    return { id: 7, score: 4, pass: true };
  });
  assert.equal(calls, 1);
  assert.equal(results.every((r) => r.pass), true);
});

test('a retry with a hard violation records the violation and an unstable retry preserves the original miss', async () => {
  const results = initialResults({ score: 3 });
  await retryBorderlineCase(cases, results, async () => ({ id: 7, pass: false, infraFail: true }));
  assert.equal(results[7].score, 3);
  await retryBorderlineCase(cases, results, async () => ({ id: 7, pass: false, hardFail: true }));
  assert.equal(results[7].hardFail, true);
});

test('hard failures, judge errors, low scores and multiple misses receive no retry', async () => {
  const multiple = initialResults({ score: 3 });
  multiple[0].pass = false;
  for (const results of [
    initialResults({ hardFail: true }),
    initialResults({ score: 0 }),
    initialResults({ score: 2 }),
    multiple,
  ]) {
    await retryBorderlineCase(cases, results, async () => assert.fail('unqualified retry'));
  }
});
