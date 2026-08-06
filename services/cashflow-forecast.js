const db = require('../db/cashflow-forecast');
const { forecastAccountBalances } = require('../lib/cashflow-forecast');
const { detectRecurringTransactions, normaliseMerchantIdentity } = require('./transaction-rules');
function createCashflowForecastService(database) {
  return async function cashflowForecast(userId, options = {}) {
    const inputs = await database.loadForecastInputs(userId);
    const recurring = inputs.recurring || detectRecurringTransactions(inputs.transactions || [], { now: options.startDate });
    const accountByMerchant = new Map();
    for (const row of inputs.transactions || []) {
      if (row.account_reference) accountByMerchant.set(normaliseMerchantIdentity(row.description), row.account_reference);
    }
    return forecastAccountBalances({
      accounts: inputs.accounts, recurring: recurring.map((item) => ({ ...item, account_reference: item.account_reference || accountByMerchant.get(item.merchant_key) })),
      days: options.days || 90, startDate: options.startDate || new Date().toISOString().slice(0, 10),
    });
  };
}
function createForecastHandler(forecast) {
  return async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 1), 730);
      return res.json(await forecast(req.session.userId, { days }));
    } catch (error) { console.error('/api/v1/cashflow-forecast:', error.message); return res.status(500).json({ error: 'Could not forecast balances.' }); }
  };
}
const cashflowForecast = createCashflowForecastService(db);
module.exports = { createCashflowForecastService, cashflowForecast, forecastHandler: createForecastHandler(cashflowForecast) };
