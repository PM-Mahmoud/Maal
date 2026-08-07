module.exports = {
  name: 'financial_scenarios',
  up: async (client) => client.query(`
    CREATE TABLE IF NOT EXISTS financial_scenarios (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
      baseline JSONB NOT NULL,
      assumptions JSONB NOT NULL,
      result JSONB NOT NULL,
      model_version TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS financial_scenarios_user_idx ON financial_scenarios(user_id, created_at DESC);
    CREATE OR REPLACE FUNCTION prevent_financial_scenario_mutation() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'financial scenarios are immutable'; END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS financial_scenarios_immutable ON financial_scenarios;
    CREATE TRIGGER financial_scenarios_immutable BEFORE UPDATE ON financial_scenarios
      FOR EACH ROW EXECUTE FUNCTION prevent_financial_scenario_mutation();
  `),
};
