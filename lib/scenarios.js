const ALLOWED_ASSUMPTIONS = new Set([
  'years', 'annual_return_rate', 'annual_income_growth_rate',
  'annual_expense_growth_rate', 'extra_annual_contribution',
]);

function assumptionError(message) { return Object.assign(new Error(message), { status: 400 }); }

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function validateAssumptions(input = {}) {
  for (const key of Object.keys(input)) {
    if (!ALLOWED_ASSUMPTIONS.has(key)) throw assumptionError(`Unsupported scenario assumption: ${key}`);
  }
  const assumptions = {
    years: input.years == null ? 10 : Number(input.years),
    annual_return_rate: input.annual_return_rate == null ? 0 : Number(input.annual_return_rate),
    annual_income_growth_rate: input.annual_income_growth_rate == null ? 0 : Number(input.annual_income_growth_rate),
    annual_expense_growth_rate: input.annual_expense_growth_rate == null ? 0 : Number(input.annual_expense_growth_rate),
    extra_annual_contribution: input.extra_annual_contribution == null ? 0 : Number(input.extra_annual_contribution),
  };
  if (!Number.isInteger(assumptions.years) || assumptions.years < 1 || assumptions.years > 60) throw assumptionError('years must be an integer between 1 and 60');
  for (const key of ['annual_return_rate', 'annual_income_growth_rate', 'annual_expense_growth_rate']) {
    if (!Number.isFinite(assumptions[key]) || assumptions[key] < -0.5 || assumptions[key] > 0.5) throw assumptionError(`${key} must be between -0.5 and 0.5`);
  }
  if (!Number.isFinite(assumptions.extra_annual_contribution) || Math.abs(assumptions.extra_annual_contribution) > 10_000_000) throw assumptionError('extra_annual_contribution is outside the supported range');
  return assumptions;
}

function startingPosition(input) {
  const investable = finiteNumber(input.cash) + finiteNumber(input.investments) + finiteNumber(input.super);
  const fixedAssets = finiteNumber(input.property) + finiteNumber(input.other_assets);
  const liabilities = Math.max(0, finiteNumber(input.liabilities));
  return { investable, fixedAssets, liabilities, netWorth: investable + fixedAssets - liabilities };
}

function project(input, assumptions, applyScenario) {
  const start = startingPosition(input);
  let investable = start.investable;
  let income = finiteNumber(input.annual_income);
  let expenses = finiteNumber(input.annual_expenses);
  const points = [{ year: 0, net_worth: roundMoney(start.netWorth) }];
  for (let year = 1; year <= assumptions.years; year += 1) {
    const returnRate = applyScenario ? assumptions.annual_return_rate : 0;
    const extra = applyScenario ? assumptions.extra_annual_contribution : 0;
    investable = Math.max(0, investable * (1 + returnRate) + income - expenses + extra);
    points.push({ year, net_worth: roundMoney(investable + start.fixedAssets - start.liabilities) });
    if (applyScenario) {
      income *= 1 + assumptions.annual_income_growth_rate;
      expenses *= 1 + assumptions.annual_expense_growth_rate;
    }
  }
  return { starting_net_worth: roundMoney(start.netWorth), ending_net_worth: points.at(-1).net_worth, points };
}

function modelScenario(input, rawAssumptions = {}) {
  const assumptions = validateAssumptions(rawAssumptions);
  const baseline = project(input, assumptions, false);
  const scenario = project(input, assumptions, true);
  return {
    model_version: 'scenario-projection-v1', as_of: input.as_of, assumptions,
    baseline: { starting_net_worth: baseline.starting_net_worth, ending_net_worth: baseline.ending_net_worth },
    scenario: { starting_net_worth: scenario.starting_net_worth, ending_net_worth: scenario.ending_net_worth },
    comparison: { net_worth_difference: roundMoney(scenario.ending_net_worth - baseline.ending_net_worth) },
    timeline: baseline.points.map((point, index) => ({ year: point.year, baseline_net_worth: point.net_worth, scenario_net_worth: scenario.points[index].net_worth })),
  };
}

module.exports = { modelScenario, validateAssumptions };
