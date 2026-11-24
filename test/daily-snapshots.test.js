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
  const { captureAccountSnapshots } = require('../db/account-snapshots');
  let capturedValues;
  await captureAccountSnapshots({
    async query(sql, params) {
      assert.equal(params[0], 7);
      if (sql.startsWith('SELECT')) {
        assert.equal((sql.match(/account\.user_id = \$1/g) || []).length, 6);
        return { rows: [
          { kind: 'cash', account: { id: 1, balance: '543.25' } },
          { kind: 'cash', account: { id: 2, balance: '100', include_in_net_worth: false } },
          { kind: 'debts', account: { id: 1, balance: '99.50' } },
        ] };
      }
      assert.match(sql, /ON CONFLICT \(user_id, account_key, snap_date\) DO NOTHING/);
      assert.equal(params[1], '2026-08-07');
      capturedValues = JSON.parse(params[2]);
      return {};
    },
  }, 7, '2026-08-07');
  assert.deepEqual(capturedValues, [
    { account_key: 'cash:1', net_worth: 543.25 },
    { account_key: 'debt:1', net_worth: -99.5 },
  ]);
  console.log('✓ daily snapshots use local dates, cents, and validated financial inputs');
})().catch((error) => { console.error(error); process.exit(1); });
