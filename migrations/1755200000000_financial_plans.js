module.exports = {
  name: 'financial_plans',
  up: async (client) => client.query(`
    CREATE TABLE IF NOT EXISTS financial_plans (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'My financial plan',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      latest_summary JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS financial_plans_user_idx ON financial_plans(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS financial_plan_snapshots (
      id BIGSERIAL PRIMARY KEY,
      plan_id BIGINT NOT NULL REFERENCES financial_plans(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      summary JSONB NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS financial_plan_snapshots_user_idx ON financial_plan_snapshots(user_id, captured_at DESC);
  `),
};
