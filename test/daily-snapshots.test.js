const assert = require('assert');
const { createDailySnapshotService, createDailySnapshotSweep, snapshotDate } = require('../services/daily-snapshots');

assert.equal(snapshotDate(new Date('2026-08-06T16:30:00Z'), 'Australia/Perth'), '2026-08-07');

(async () => {
  let recorded;
  const create = createDailySnapshotService({
    loadSnapshotProfile: async (userId) => {
      assert.equal(userId, 7);
      return { cash_savings: '100.25', investment_portfolio: '50.10', super_balance: '200.20', property_value: '0', total_debt: '25.05', hecs_balance: '0' };
    },
    recordSnapshot: async (userId, date, values) => { recorded = { userId, date, values }; return { ...values, snap_date: date }; },
  });
  const result = await create(7, { now: new Date('2026-08-06T16:30:00Z') });
  assert.equal(recorded.date, '2026-08-07');
  assert.deepStrictEqual(recorded.values, {
    netWorth: 325.5, assetsTotal: 350.55, superBalance: 200.2,
    investBalance: 50.1, debtsTotal: 25.05, cashBalance: 100.25,
  });
  assert.equal(result.netWorth, 325.5);
  const captured = [];
  const sweep = createDailySnapshotSweep(
    { listSnapshotUserIds: async () => [7, 8] },
    async (userId) => { captured.push(userId); }
  );
  assert.deepStrictEqual(await sweep(), { captured: 2, failed: 0 });
  assert.deepStrictEqual(captured, [7, 8]);
  await assert.rejects(
    () => createDailySnapshotService({ loadSnapshotProfile: async () => ({ cash_savings: 'NaN' }) })(7),
    /Invalid financial value/
  );
  console.log('✓ daily snapshots use local dates, cents, and validated financial inputs');
})().catch((error) => { console.error(error); process.exit(1); });
