const assert = require('assert');
const { forecastAccountBalances } = require('../lib/cashflow-forecast');
const { createCashflowForecastService } = require('../services/cashflow-forecast');

const forecast = forecastAccountBalances({
  accounts: [{ account_reference: 'cash:main', balance: 1000 }],
  recurring: [
    { kind: 'income', averageAmount: 2000, nextEstimate: '2026-08-10', cadence: 'monthly' },
    { kind: 'bill', averageAmount: 600, nextEstimate: '2026-08-15', cadence: 'monthly' },
  ],
  startDate: '2026-08-07', days: 40,
});
assert.equal(forecast.accounts[0].points.find((point) => point.date === '2026-08-10').balance, 3000);
assert.equal(forecast.accounts[0].points.find((point) => point.date === '2026-08-15').balance, 2400);
assert.equal(forecast.accounts[0].closing_balance, 3800);

(async () => {
  let scoped;
  const service = createCashflowForecastService({
    loadForecastInputs: async (userId) => { scoped = userId; return { accounts: [{ account_reference: 'a', balance: 50 }], recurring: [] }; },
  });
  assert.equal((await service(8, { days: 30, startDate: '2026-08-07' })).accounts[0].closing_balance, 50);
  assert.equal(scoped, 8);
  console.log('✓ account forecasts apply recurring cash flows on their expected dates');
})().catch((error) => { console.error(error); process.exit(1); });
