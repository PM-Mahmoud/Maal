module.exports = {
  name: 'snapshots_plan_basiq',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS net_worth_snapshots (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        snap_date DATE NOT NULL DEFAULT CURRENT_DATE,
        net_worth BIGINT NOT NULL DEFAULT 0,
        assets_total BIGINT NOT NULL DEFAULT 0,
        super_balance BIGINT NOT NULL DEFAULT 0,
        invest_balance BIGINT NOT NULL DEFAULT 0,
        debts_total BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, snap_date)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON net_worth_snapshots (user_id, snap_date);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS basiq_user_id TEXT;
    `);
  }
};
