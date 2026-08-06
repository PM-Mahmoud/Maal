const db = require('../db/investment-performance');
const { calculateModifiedDietz } = require('../lib/investment-performance');

function createInvestmentPerformanceService(database) {
  return async function investmentPerformance(userId, days = 365) {
    const inputs = await database.loadPerformanceInputs(userId, days);
    if (inputs.snapshots.length < 2) {
      return { return_pct: null, investment_gain: null, net_contributions: 0, period_days: days };
    }
    const opening = inputs.snapshots[0];
    const closing = inputs.snapshots[inputs.snapshots.length - 1];
    return {
      ...calculateModifiedDietz({
        openingValue: opening.invest_balance, closingValue: closing.invest_balance,
        startDate: opening.snap_date, endDate: closing.snap_date, cashFlows: inputs.cashFlows,
      }),
      opening_value: Number(opening.invest_balance), closing_value: Number(closing.invest_balance),
      start_date: opening.snap_date, end_date: closing.snap_date, period_days: days,
    };
  };
}

function createInvestmentPerformanceHandler(calculate) {
  return async function investmentPerformanceHandler(req, res) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 365, 1), 3660);
      return res.json(await calculate(req.session.userId, days));
    } catch (error) {
      console.error('/api/v1/investment-performance error:', error.message);
      return res.status(500).json({ error: 'Could not calculate investment performance.' });
    }
  };
}

const investmentPerformance = createInvestmentPerformanceService(db);
module.exports = {
  createInvestmentPerformanceService, createInvestmentPerformanceHandler,
  investmentPerformance,
  investmentPerformanceHandler: createInvestmentPerformanceHandler(investmentPerformance),
};
