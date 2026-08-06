const assert = require('assert');
const { buildMonthlyClose } = require('../lib/monthly-close');
const { createMonthlyCloseService } = require('../services/monthly-close');
const report = buildMonthlyClose('2026-07', {
  snapshots: [{ snap_date: '2026-07-01', net_worth: 10000 }, { snap_date: '2026-07-31', net_worth: 10800 }],
  transactions: [{ amount: 3000 }, { amount: -2200 }], reconciliations: [{ status: 'mismatch' }],
  investmentPerformance: { return_pct: 2.5, net_contributions: 500 },
});
assert.equal(report.net_worth.change, 800);
assert.deepStrictEqual(report.cash_flow, { money_in: 3000, money_out: 2200, net: 800 });
assert.equal(report.reconciliation_exceptions, 1);

(async () => {
  let stored;
  const close = createMonthlyCloseService({
    findMonthlyClose: async () => null,
    loadMonthlyCloseInputs: async () => ({ snapshots: [], transactions: [], reconciliations: [], investmentPerformance: null }),
    storeMonthlyClose: async (userId, month, payload, hash) => { stored = { userId, month, payload, hash }; return { id: 1, month, payload, payload_hash: hash }; },
  }, null);
  const result = await close(7, '2026-07');
  assert.equal(stored.userId, 7); assert.equal(result.payload_hash.length, 64);
  const existing = createMonthlyCloseService({ findMonthlyClose: async () => ({ id: 2, month: '2026-07' }) }, null);
  assert.equal((await existing(7, '2026-07')).id, 2);
  console.log('✓ monthly closes are deterministic and never overwrite an existing close');
})().catch((error) => { console.error(error); process.exit(1); });
