module.exports = { name: 'monthly_financial_closes', up: async (client) => client.query(`
  CREATE TABLE IF NOT EXISTS monthly_financial_closes (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    close_month DATE NOT NULL, payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, close_month)
  );
  CREATE INDEX IF NOT EXISTS idx_monthly_closes_user ON monthly_financial_closes(user_id, close_month DESC);
  CREATE OR REPLACE FUNCTION protect_monthly_financial_close() RETURNS TRIGGER AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN RAISE EXCEPTION 'monthly financial closes are immutable'; END IF;
    RETURN OLD;
  END; $$ LANGUAGE plpgsql;
  CREATE TRIGGER monthly_financial_closes_immutable BEFORE UPDATE OR DELETE ON monthly_financial_closes
    FOR EACH ROW EXECUTE FUNCTION protect_monthly_financial_close();
`) };
