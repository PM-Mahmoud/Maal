const { cashflowForecast } = require('./cashflow-forecast');
const { detectCashRisks } = require('../lib/cash-risks');
function createCashRiskService(forecast) {
  return async function cashRisks(userId, options = {}) {
    return detectCashRisks(await forecast(userId, options), options);
  };
}
function createCashRiskHandler(calculate) {
  return async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      const threshold = Math.max(Number(req.query.threshold) || 0, 0);
      return res.json(await calculate(req.session.userId, { days, threshold }));
    } catch (error) { console.error('/api/v1/cash-risks:', error.message); return res.status(500).json({ error: 'Could not assess cash risks.' }); }
  };
}
const cashRiskService = createCashRiskService(cashflowForecast);
module.exports = { createCashRiskService, cashRiskService, cashRiskHandler: createCashRiskHandler(cashRiskService) };
