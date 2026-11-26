'use strict';

const { getConstants, computeIncomeTax } = require('./au-constants');
const { estimateTax } = require('./tax');
const { compoundGrowth } = require('./calc');
const { debtPayoff } = require('./planning');

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const aud = value => currency.format(value);
const pct = rate => `${Math.round(rate * 10000) / 100}%`;
const nonnegative = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const properties = {
  tax_brackets: {},
  super_tax_scenario: {
    additionalContribution: { type: 'number', minimum: 0, maximum: 1_000_000 },
  },
  debt_payoff: {
    strategy: { type: 'string', enum: ['avalanche', 'snowball'] },
    extraMonthlyPayment: { type: 'number', minimum: 0, maximum: 100_000 },
  },
  growth_scenario: {
    years: { type: 'integer', minimum: 1, maximum: 60 },
    annualReturnPercent: { type: 'number', minimum: -50, maximum: 25 },
    monthlyContribution: { type: 'number', minimum: 0, maximum: 100_000 },
  },
};
const descriptions = {
  tax_brackets: 'Show Australian resident marginal brackets for the current financial year and the signed-in person’s tax estimate when income is available.',
  super_tax_scenario: 'Compare a voluntary concessional super contribution the user explicitly specifies against the current financial year’s cap and income tax. Education only.',
  debt_payoff: 'Compare debt repayment strategies against the signed-in person’s recorded debts. Use the optional monthly payment only when stated by the user.',
  growth_scenario: 'Project the signed-in person’s cash savings using the explicitly stated years and hypothetical annual return. Ask for missing assumptions rather than inventing them.',
};
const required = {
  tax_brackets: [], super_tax_scenario: ['additionalContribution'], debt_payoff: [],
  growth_scenario: ['years', 'annualReturnPercent'],
};

const definitions = Object.keys(properties).map(name => ({
  name,
  description: descriptions[name],
  parameters: { type: 'object', properties: properties[name], required: required[name], additionalProperties: false },
}));

function validateCalculator(name, args) {
  if (!Object.hasOwn(properties, name)) throw new RangeError('Unknown calculator.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('Provide calculation inputs as an object.');
  for (const key of required[name]) {
    if (!Object.hasOwn(args, key)) throw new TypeError(`Missing calculation input ${key}.`);
  }
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(properties[name], key)) throw new TypeError('Unexpected calculation input.');
    const rule = properties[name][key];
    const valid = rule.enum ? rule.enum.includes(value)
      : Number.isFinite(value) && value >= rule.minimum && value <= rule.maximum
        && (rule.type !== 'integer' || Number.isInteger(value));
    if (!valid) throw new TypeError(`Invalid calculation input ${key}.`);
  }
}

function widget(source, title, caption, rows) {
  return {
    source, title, type: 'table', canSave: false,
    data: {
      caption,
      columns: ['Item', 'Value'],
      rows: rows.map(([Item, Value]) => ({ Item, Value })),
    },
  };
}

function taxBrackets(profile, date) {
  const constants = getConstants(date);
  const estimate = estimateTax(profile, date);
  let lower = 0;
  const brackets = constants.incomeTaxBrackets.map(({ upTo, rate }) => {
    const bracket = { above: lower, upTo: Number.isFinite(upTo) ? upTo : null, rate };
    lower = upTo;
    return bracket;
  });
  const rows = brackets.map(({ above, upTo, rate }) => [
    upTo == null ? `Over ${aud(above)}` : `${aud(above ? above + 1 : 0)}–${aud(upTo)}`, pct(rate),
  ]);
  if (estimate.hasData) rows.push(['Indicative annual take-home', aud(estimate.takeHome)]);
  return {
    result: { fy: constants.fy, brackets, estimate },
    widget: widget('tax_brackets', `Income tax brackets · FY ${constants.fy}`,
      'Resident rates. The take-home estimate includes the simple Medicare and HELP amounts and excludes deductions and offsets.', rows),
  };
}

async function superTaxScenario(profile, args, date) {
  const income = nonnegative(profile.annual_income);
  if (!income) return { error: 'Add annual income to your profile to compare super contributions.' };
  const { fy, super: superRules } = getConstants(date);
  const { remainingConcessionalCap } = await import('../shared/super-contrib.mjs');
  const employerContribution = Math.round(income * superRules.sgRate);
  const capRoom = remainingConcessionalCap(employerContribution, superRules.concessionalCap);
  const addedContribution = Math.min(args.additionalContribution, capRoom, income);
  const incomeTaxBefore = computeIncomeTax(income, date).totalTax;
  const incomeTaxAfter = computeIncomeTax(income - addedContribution, date).totalTax;
  const result = { fy, employerContribution, capRoom, addedContribution, incomeTaxBefore, incomeTaxAfter };
  return {
    result,
    widget: widget('super_tax_scenario', 'Super and tax scenario',
      'Modelled employer super on salary and the standard cap. Excludes other contributions, employer contribution base limits and HELP.',
      [['Estimated employer contribution', aud(employerContribution)], ['Remaining cap', aud(capRoom)],
       ['Modelled extra contribution', aud(addedContribution)], ['Before · income tax and Medicare', aud(incomeTaxBefore)],
       ['With extra contribution · income tax and Medicare', aud(incomeTaxAfter)]]),
  };
}

function existingDebtScenario(debts, args, date) {
  if (!debts.some(({ balance }) => nonnegative(balance))) return { error: 'No debt balances are available to model.' };
  const input = debts.map((debt, index) => ({
    id: index, label: `Debt ${index + 1}`,
    balance: nonnegative(debt.balance), interest_rate: nonnegative(debt.interest_rate), min_payment: nonnegative(debt.min_payment),
  }));
  const result = debtPayoff(input, {
    strategy: args.strategy || 'avalanche', extraMonthly: args.extraMonthlyPayment || 0,
    asOf: typeof date === 'string' ? date : date?.toISOString().slice(0, 10),
  });
  return {
    result,
    widget: widget('debt_payoff', 'Debt repayment scenario',
      'Illustration based on recorded debts, rates and minimum payments. The model excludes fees and future changes to rates and payments.',
      [['Monthly payment', aud(result.monthly_budget)], ['Starting balance', aud(result.starting_balance)],
       ['Modelled interest', result.feasible ? aud(result.total_interest) : 'Unavailable'],
       ['Months to repay', result.months_to_debt_free ?? 'No payoff within the model']]),
  };
}

function growthScenario(profile, args) {
  const startingBalance = nonnegative(profile.cash_savings);
  const result = compoundGrowth({
    principal: startingBalance, annualRate: args.annualReturnPercent / 100, years: args.years,
    monthlyContribution: args.monthlyContribution || 0,
  });
  return {
    result,
    widget: widget('growth_scenario', 'Growth scenario',
      'Illustration with a fixed return. Excludes tax, inflation and fees. Actual returns vary.',
      [['Starting cash balance', aud(startingBalance)], ['Assumed annual return', pct(result.effectiveAnnualRate)],
       ['Projection in years', args.years], ['Total contributed', aud(result.totalContributed)], ['Projected balance', aud(result.finalValue)]]),
  };
}

async function runCalculator(name, args, { profile = {}, debts = [], date } = {}) {
  validateCalculator(name, args);
  switch (name) {
    case 'tax_brackets': return taxBrackets(profile, date);
    case 'super_tax_scenario': return superTaxScenario(profile, args, date);
    case 'debt_payoff': return existingDebtScenario(debts, args, date);
    case 'growth_scenario': return growthScenario(profile, args);
  }
}

module.exports = { definitions, validateCalculator, runCalculator };
