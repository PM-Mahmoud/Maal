'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runCalculator } = require('../lib/advisor-calculators');
const pool = require('../db/pool');
const gateway = require('../services/gateway');
const { forAccount, calculatorHandler } = require('../services/advisor-calculators');

const date = '2026-07-02';

test('tax uses the enacted financial-year brackets and existing estimate', async () => {
  const { result, widget } = await runCalculator('tax_brackets', {}, { date, profile: { annual_income: 80_000 } });
  assert.equal(result.fy, '2026-27');
  assert.deepEqual(result.brackets[1], { above: 18_200, upTo: 45_000, rate: 0.15 });
  assert.equal(result.estimate.hasData, true);
  assert.equal(widget.type, 'table');
  assert.equal(widget.canSave, false);
});

test('the super tax comparison observes the current cap and available income', async () => {
  const request = { additionalContribution: 90_000 };
  const { result } = await runCalculator('super_tax_scenario', request, { date, profile: { annual_income: 100_000 } });
  assert.equal(result.employerContribution, 12_000);
  assert.equal(result.capRoom, 20_500);
  assert.equal(result.addedContribution, 20_500);
  assert.ok(result.incomeTaxAfter < result.incomeTaxBefore);

  const high = await runCalculator('super_tax_scenario', request, { date, profile: { annual_income: 450_000 } });
  assert.equal(high.result.capRoom, 0);
  assert.equal(high.result.incomeTaxAfter, high.result.incomeTaxBefore);
});

test('debt payoff uses account-owned balances and the existing repayment maths', async (t) => {
  const read = t.mock.method(pool, 'query', async (sql, values) => {
    assert.match(sql, /FROM debts WHERE user_id = \$1/);
    assert.deepEqual(values, [45]);
    return { rows: [{ balance: '1200', min_payment: '100', interest_rate: '0' }] };
  });
  const calculators = forAccount(45, {});
  const { result } = await calculators.run('debt_payoff', { strategy: 'snowball' });
  assert.equal(result.starting_balance, 1200);
  assert.equal(result.months_to_debt_free, 12);
  assert.equal(read.mock.callCount(), 1);
  await assert.rejects(calculators.run('debt_payoff', { user_id: 46 }), /Unexpected calculation input/);
  assert.equal(read.mock.callCount(), 1);
});

test('growth uses a bounded explicit scenario without rounding the assumptions', async () => {
  const context = { profile: { cash_savings: 1000 } };
  const args = { years: 2, annualReturnPercent: 0, monthlyContribution: 100 };
  const { result } = await runCalculator('growth_scenario', args, context);
  assert.equal(result.finalValue, 3400);
  await assert.rejects(runCalculator('growth_scenario', { ...args, years: 1_000 }, context), /Invalid calculation input years/);
  await assert.rejects(runCalculator('growth_scenario', { years: 2 }, context), /Missing calculation input annualReturnPercent/);
});

test('the Forecast calculator API requires a signed-in account', async () => {
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await calculatorHandler({ session: {}, params: { name: 'tax_brackets' } }, response);
  assert.deepEqual([response.code, response.body], [401, { error: 'Not authenticated' }]);
});

test('Advisor sends a real tool declaration and can only show its calculated result after verification', async (t) => {
  const env = {
    GATEWAY_BASE_URL: 'https://model.example.invalid',
    GATEWAY_API_KEY: 'stubbed-gateway-fixture',
    GATEWAY_MODEL_REASONER: 'reasoner',
    GATEWAY_MODEL_VERIFIER: 'verifier',
  };
  for (const [key, value] of Object.entries(env)) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  t.mock.method(require('../services/embeddings'), 'hasEmbeddings', () => false);

  const packets = [];
  gateway._setFetchForTests(async (_url, options) => {
    const payload = JSON.parse(options.body);
    packets.push(payload);
    let message;
    if (payload.tools) {
      assert.ok(payload.tools.some(({ function: definition }) => definition.name === 'growth_scenario'));
      assert.equal(payload.tool_choice, 'auto');
      message = { tool_calls: [{
        id: 'fixture-call', type: 'function', function: {
          name: 'growth_scenario', arguments: '{"years":2,"annualReturnPercent":0,"monthlyContribution":100}',
        },
      }] };
    } else if (payload.model === 'reasoner') {
      const tool = payload.messages.find(({ role }) => role === 'tool');
      assert.equal(tool.tool_call_id, 'fixture-call');
      assert.ok(JSON.parse(tool.content).rows.some(({ Value }) => Value === '$3,400'));
      message = { content: 'This illustrates the result with your chosen assumptions.' };
    } else {
      assert.equal(payload.model, 'verifier');
      assert.match(payload.messages[1].content, /CALCULATOR RESULTS.*\$3,400/);
      message = { content: '{"pass":true}' };
    }
    return new Response(JSON.stringify({ choices: [{ message }] }));
  });
  t.after(() => gateway._setFetchForTests());

  const { chatRich } = require('../services/advisor');
  const stream = [];
  const response = await chatRich({ id: 45 }, { cash_savings: 1000 }, null,
    [{ role: 'user', content: 'Compare savings in two years at no growth, adding $100 monthly.' }], [], {},
    { requireVerification: true, onStep: (...step) => stream.push(step) });
  assert.equal(packets.length, 3);
  assert.deepEqual(stream.slice(-2), [['verifying', 'start'], ['verifying', 'end']]);
  assert.equal(response.widgets[0].source, 'growth_scenario');
  assert.equal(response.reply, 'This illustrates the result with your chosen assumptions.');
});
