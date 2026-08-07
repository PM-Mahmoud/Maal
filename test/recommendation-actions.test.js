const test = require('node:test');
const assert = require('node:assert/strict');

const { rankActions, actionsFromHealthRules } = require('../lib/recommendation-actions');
const { createRecommendationActionService } = require('../services/recommendation-actions');

test('actions are ranked by impact, urgency, confidence, and effort with disclosed scoring', () => {
  const ranked = rankActions([
    { key: 'easy-win', impact: 4, urgency: 3, confidence: 5, effort: 1 },
    { key: 'large-project', impact: 5, urgency: 3, confidence: 5, effort: 5 },
    { key: 'uncertain', impact: 5, urgency: 5, confidence: 1, effort: 1 },
  ]);

  assert.deepEqual(ranked.map((action) => action.key), ['easy-win', 'large-project', 'uncertain']);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].ranking.methodology_version, 'action-ranking-v1');
  assert.match(ranked[0].ranking.formula, /impact/);
});

test('health rules become educational actions with their observed baseline', () => {
  const actions = actionsFromHealthRules([
    { key: 'savings', status: 'attention', observed: { value: 2, unit: 'months' }, target: { operator: '>=', value: 6, unit: 'months' }, explanation: 'Two months covered.' },
    { key: 'debt', status: 'healthy', observed: { value: 10, unit: 'percent' }, target: { operator: '<=', value: 35, unit: 'percent' } },
  ]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].source_key, 'health:savings');
  assert.deepEqual(actions[0].baseline, { value: 2, unit: 'months', captured_from: 'maal-health-rules-v1' });
  assert.match(actions[0].rationale, /Two months/);
});

test('completion records an append-only event and a measured outcome delta', async () => {
  const calls = [];
  const database = {
    getRecommendation: async () => ({ id: '7', user_id: '42', source_key: 'health:savings', status: 'in_progress', baseline: { value: 2, unit: 'months' } }),
    recordTransition: async (_userId, _id, event, outcome) => { calls.push(['event', event]); calls.push(['outcome', outcome]); return { id: '7', status: event.to_status }; },
  };
  const healthProvider = async () => ({ rules: [{ key: 'savings', observed: { value: 4.5, unit: 'months' }, target: { operator: '>=', value: 6, unit: 'months' } }] });
  const service = createRecommendationActionService(database, healthProvider, () => new Date('2026-08-07T02:00:00Z'));

  const result = await service.transition(42, 7, 'completed');
  assert.equal(result.status, 'completed');
  assert.equal(calls[0][1].from_status, 'in_progress');
  assert.equal(calls[0][1].to_status, 'completed');
  assert.equal(calls[1][1].value, 4.5);
  assert.equal(calls[1][1].baseline_value, 2);
  assert.equal(calls[1][1].delta, 2.5);
  assert.equal(calls[1][1].target_met, false);
  assert.equal(calls[1][1].outcome_status, 'progressing');
});

test('completion is rejected without a measurable outcome', async () => {
  let writes = 0;
  const database = {
    getRecommendation: async () => ({ id: '9', source_key: 'health:savings', status: 'in_progress', baseline: { value: 2, unit: 'months' } }),
    recordTransition: async () => { writes += 1; },
  };
  const service = createRecommendationActionService(database, async () => ({ rules: [] }));

  await assert.rejects(() => service.transition(42, 9, 'completed'), /cannot be completed until its outcome can be measured/i);
  assert.equal(writes, 0);
});

test('refresh synchronizes ranked actions and resolves healthy rules in one database operation', async () => {
  let synchronized;
  const health = { rules: [{ key: 'savings', status: 'healthy', observed: { value: 7, unit: 'months' }, target: { operator: '>=', value: 6 } }] };
  const database = {
    syncRecommendations: async (...args) => { synchronized = args; },
    listRecommendations: async () => [{ id: '1', status: 'completed' }],
  };
  const measuredAt = new Date('2026-08-07T02:00:00Z');
  const service = createRecommendationActionService(database, async () => health, () => measuredAt);

  const result = await service.refresh(42);
  assert.equal(synchronized[0], 42);
  assert.deepEqual(synchronized[1], []);
  assert.equal(synchronized[2], health.rules);
  assert.equal(synchronized[3], measuredAt);
  assert.deepEqual(result, [{ id: '1', status: 'completed' }]);
});

test('invalid lifecycle transitions are rejected without writes', async () => {
  let writes = 0;
  const database = {
    getRecommendation: async () => ({ id: '7', status: 'completed' }),
    recordTransition: async () => { writes += 1; },
  };
  const service = createRecommendationActionService(database, async () => ({ rules: [] }));
  await assert.rejects(() => service.transition(42, 7, 'in_progress'), /Cannot move/);
  assert.equal(writes, 0);
});

test('outcome deltas treat a lower value as improvement for maximum targets', async () => {
  let recorded;
  const database = {
    getRecommendation: async () => ({ id: '8', source_key: 'health:debt', status: 'in_progress', baseline: { value: 50, unit: 'percent' }, target: { operator: '<=', value: 35 } }),
    recordTransition: async (_userId, _id, event, outcome) => { recorded = outcome; return { id: '8', status: event.to_status }; },
  };
  const service = createRecommendationActionService(database, async () => ({ rules: [{ key: 'debt', observed: { value: 30, unit: 'percent' } }] }));
  await service.transition(42, 8, 'completed');
  assert.equal(recorded.delta, 20);
});
