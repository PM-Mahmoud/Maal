module.exports = {
  name: 'reliable_daily_snapshots',
  up: async (client) => {
    await client.query(`
      ALTER TABLE net_worth_snapshots
        ALTER COLUMN net_worth TYPE NUMERIC(18,2),
        ALTER COLUMN assets_total TYPE NUMERIC(18,2),
        ALTER COLUMN super_balance TYPE NUMERIC(18,2),
        ALTER COLUMN invest_balance TYPE NUMERIC(18,2),
        ALTER COLUMN debts_total TYPE NUMERIC(18,2),
        ALTER COLUMN cash_balance TYPE NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
  },
};
