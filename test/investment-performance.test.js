const assert = require('assert');
const { calculateModifiedDietz } = require('../lib/investment-performance');
const { createInvestmentPerformanceService } = require('../services/investment-performance');

const result = calculateModifiedDietz({
  openingValue: 10000, closingValue: 12600,
  startDate: '2026-01-01', endDate: '2026-01-31',
  cashFlows: [{ amount: 2000, occurred_on: '2026-01-16' }],
});
assert.equal(result.net_contributions, 2000);
assert.equal(result.investment_gain, 600);
assert.equal(result.return_pct, 5.45);
assert.equal(calculateModifiedDietz({ openingValue: 0, closingValue: 100, startDate: '2026-01-01', endDate: '2026-01-31', cashFlows: [] }).return_pct, null);

(async () => {
  let scopedUser;
  const calculate = createInvestmentPerformanceService({
    loadPerformanceInputs: async (userId, days) => {
      scopedUser = userId;
      assert.equal(days, 365);
      return {
        snapshots: [
          { snap_date: '2026-01-01', invest_balance: 10000 },
          { snap_date: '2026-01-31', invest_balance: 12600 },
        ],
        cashFlows: [{ amount: 2000, occurred_on: '2026-01-16' }],
      };
    },
  });
  const performance = await calculate(91, 365);
  assert.equal(scopedUser, 91);
  assert.equal(performance.return_pct, 5.45);
  console.log('✓ investment performance excludes deposits using user-scoped cash flows');
})().catch((error) => { console.error(error); process.exit(1); });
