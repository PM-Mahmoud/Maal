const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const number = (value) => Number(value) || 0;
const validNumber = (value) => (
  value !== null
  && value !== undefined
  && !(typeof value === 'string' && value.trim() === '')
  && Number.isFinite(Number(value))
);
const dateString = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

function netWorthLineage(snapshot) {
  const value = snapshot || {};
  return {
    type: 'net_worth',
    version: '1',
    inputs: {
      cash_balance: number(value.cashBalance),
      investment_balance: number(value.investBalance),
      super_balance: number(value.superBalance),
      other_assets_balance: number(value.assetsTotal)
        - number(value.cashBalance)
        - number(value.investBalance)
        - number(value.superBalance),
      assets_total: number(value.assetsTotal),
      debts_total: number(value.debtsTotal),
    },
    assumptions: {
      currency: 'AUD',
      formula: 'assets_total - debts_total',
    },
    result: {
      net_worth: number(value.netWorth),
      assets_total: number(value.assetsTotal),
      debts_total: number(value.debtsTotal),
    },
  };
}

function scoreLineage(score, profile) {
  const value = score || {};
  const input = profile || {};
  return {
    type: 'maal_score',
    version: '2',
    inputs: {
      annual_income: number(input.annual_income),
      cash_savings: number(input.cash_savings),
      monthly_expenses: number(input.monthly_expenses),
      super_balance: number(input.super_balance),
      investment_portfolio: number(input.investment_portfolio),
      property_value: number(input.property_value),
      hecs_balance: number(input.hecs_balance),
      total_debt: number(input.total_debt),
      age: number(input.age),
      age_band: input.age_band || input.onboarding_data?.age_band || null,
      retirement_age: number(input.retirement_age),
      insurance_cover: input.insurance_cover || 'none',
      has_private_health: input.has_private_health === true,
      completed_onboarding: input.completed_onboarding === true,
      years_in_practice: number(input.years_in_practice),
    },
    assumptions: {
      methodology: 'weighted five-pillar financial wellbeing score',
      weights: Object.fromEntries(
        (value.pillars || []).map((pillar) => [pillar.key, number(pillar.weight)])
      ),
    },
    result: {
      score: number(value.score),
      band: value.band || null,
      has_data: value.hasData === true,
      pillars: (value.pillars || []).map((pillar) => ({
        key: pillar.key,
        label: pillar.label,
        score: number(pillar.score),
        weight: number(pillar.weight),
        note: pillar.note,
      })),
      methodology_version: value.methodology_version || null,
      rules: (value.rules || []).map((rule) => ({
        key: rule.key,
        inputs: rule.inputs,
        assumptions: rule.assumptions,
        formula: rule.formula,
        observed: rule.observed,
        target: rule.target,
        status: rule.status,
        explanation: rule.explanation,
        warnings: rule.warnings || [],
      })),
    },
  };
}

function cashFlowLineage(transactions, windowDays = 30) {
  const included = (transactions || []).filter(
    (transaction) => transaction.status !== 'pending'
      && validNumber(transaction.amount)
      && !Number.isNaN(new Date(transaction.post_date).getTime())
  ).sort((a, b) => (
    new Date(a.post_date).getTime() - new Date(b.post_date).getTime()
    || number(a.id) - number(b.id)
  ));
  const inflow = included.reduce(
    (sum, transaction) => sum + Math.max(0, Number(transaction.amount)),
    0
  );
  const outflow = included.reduce(
    (sum, transaction) => sum + Math.abs(Math.min(0, Number(transaction.amount))),
    0
  );
  return {
    type: 'cash_flow',
    version: '1',
    inputs: {
      window_days: windowDays,
      transactions: included.map((transaction) => ({
        id: transaction.id,
        amount: number(transaction.amount),
        status: transaction.status || null,
        post_date: dateString(transaction.post_date),
      })),
      transaction_count: included.length,
      period_start: included.length ? dateString(included[0].post_date) : null,
      period_end: included.length ? dateString(included[included.length - 1].post_date) : null,
    },
    assumptions: {
      currency: 'AUD',
      pending_transactions: 'excluded',
      inflow_rule: 'positive signed amounts',
      outflow_rule: 'absolute value of negative signed amounts',
    },
    result: {
      inflow: round2(inflow),
      outflow: round2(outflow),
      net_cash_flow: round2(inflow - outflow),
    },
  };
}

function investmentLineage(investments) {
  const valid = (investments || []).filter(
    (investment) => validNumber(investment.value)
  );
  const included = valid.filter((investment) => (investment.currency || 'AUD') === 'AUD');
  const excluded = valid.filter((investment) => (investment.currency || 'AUD') !== 'AUD');
  const currentValue = included.reduce((sum, investment) => sum + number(investment.value), 0);
  const costBasis = included.reduce((sum, investment) => sum + number(investment.cost_basis), 0);
  const gain = currentValue - costBasis;
  return {
    type: 'investment_metrics',
    version: '1',
    inputs: {
      investments: included.map((investment) => ({
        id: investment.id,
        name: investment.name || null,
        value: number(investment.value),
        cost_basis: number(investment.cost_basis),
        currency: investment.currency || 'AUD',
      })),
      holding_count: included.length,
      base_currency: 'AUD',
      excluded_holdings: excluded.map((investment) => ({
        id: investment.id,
        currency: investment.currency,
        reason: 'fx_rate_unavailable',
      })),
    },
    assumptions: {
      valuation: 'latest stored holding value',
      return_method: 'unrealised gain divided by cost basis',
      cash_flows: 'not adjusted; time-weighted performance is Build 4.4',
      foreign_currency_holdings: 'excluded unless already valued in AUD',
    },
    result: {
      current_value: round2(currentValue),
      cost_basis: round2(costBasis),
      unrealised_gain: round2(gain),
      unrealised_return_pct: costBasis > 0 ? round2((gain / costBasis) * 100) : null,
      coverage: excluded.length ? 'incomplete' : 'complete',
    },
  };
}

module.exports = {
  cashFlowLineage,
  investmentLineage,
  netWorthLineage,
  scoreLineage,
};
