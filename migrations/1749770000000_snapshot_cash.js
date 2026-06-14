// Track cash balance in the daily snapshot so the Total Cash tile can chart a
// real trend (it previously had no cash history and reused the super series).
module.exports = {
  name: 'snapshot_cash',
  up: async (client) => {
    await client.query(`
      ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS cash_balance BIGINT DEFAULT 0;
    `);
  },
};
