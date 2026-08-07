const test = require('node:test');
const assert = require('node:assert/strict');

const { modelScenario, validateAssumptions } = require('../lib/scenarios');
const { createScenarioService } = require('../services/scenarios');
const scenarioMigration = require('../migrations/1755300000000_financial_scenarios');

const baseline = Object.freeze({
  as_of: '2026-08-07',
  cash: 20_000,
  investments: 80_000,
  property: 600_000,
  super: 120_000,
  other_assets: 5_000,
  liabilities: 300_000,
  annual_income: 100_000,
  annual_expenses: 60_000,
});

test('scenario modelling compares an isolated projection with the unchanged baseline', () => {
  const input = { ...baseline };
  const result = modelScenario(input, {
    years: 2,
    annual_return_rate: 0.05,
    annual_income_growth_rate: 0,
    annual_expense_growth_rate: 0,
    extra_annual_contribution: 10_000,
  });

  assert.deepEqual(input, baseline);
  assert.equal(result.baseline.starting_net_worth, 525_000);
  assert.equal(result.scenario.starting_net_worth, 525_000);
  assert.equal(result.baseline.ending_net_worth, 605_000);
  assert.equal(result.scenario.ending_net_worth, 650_050);
  assert.equal(result.comparison.net_worth_difference, 45_050);
  assert.equal(result.timeline.length, 3);
});

test('scenario assumptions reject unsafe or unbounded values', () => {
  assert.throws(() => validateAssumptions({ years: 0 }), /years/);
  assert.throws(() => validateAssumptions({ annual_return_rate: 2 }), /annual_return_rate/);
  assert.throws(() => validateAssumptions({ unexpected: 1 }), /unexpected/);
});

test('saved scenarios contain an immutable baseline and never write live wealth records', async () => {
  const calls = [];
  const database = {
    loadScenarioBaseline: async (userId, asOf) => {
      calls.push(['load', userId, asOf]);
      return { ...baseline };
    },
    saveScenario: async (userId, record) => {
      calls.push(['save', userId, record]);
      return { id: '9', ...record };
    },
    listScenarios: async () => [],
    getScenario: async () => null,
  };
  const service = createScenarioService(database, () => '2026-08-07');
  const saved = await service.create(42, {
    name: 'Higher contributions',
    assumptions: { years: 5, extra_annual_contribution: 12_000 },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['load', 42, '2026-08-07']);
  assert.equal(calls[1][0], 'save');
  assert.deepEqual(calls[1][2].baseline, baseline);
  assert.equal(saved.result.assumptions.extra_annual_contribution, 12_000);
});

test('scenario persistence prevents edits without blocking account-deletion cascades', async () => {
  let sql = '';
  await scenarioMigration.up({ query: async (statement) => { sql = statement; } });
  assert.match(sql, /BEFORE UPDATE ON financial_scenarios/);
  assert.doesNotMatch(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /user_id BIGINT NOT NULL/);
});
