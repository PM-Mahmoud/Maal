module.exports = {
  name: 'account_reconciliation',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_provider_details (
        transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_reference TEXT NOT NULL,
        balance_after NUMERIC,
        provider_posted_at TIMESTAMPTZ,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_provider_details_account
        ON transaction_provider_details(user_id, account_reference);
      CREATE TABLE IF NOT EXISTS account_reconciliations (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_reference TEXT NOT NULL,
        provider_balance NUMERIC,
        calculated_balance NUMERIC,
        difference NUMERIC,
        status TEXT NOT NULL CHECK (status IN ('matched','mismatch','insufficient_data')),
        transaction_count INTEGER NOT NULL DEFAULT 0,
        anchor_transaction_id BIGINT REFERENCES transactions(id) ON DELETE SET NULL,
        tolerance NUMERIC NOT NULL DEFAULT 0.01,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, account_reference)
      );
      CREATE INDEX IF NOT EXISTS idx_account_reconciliations_user
        ON account_reconciliations(user_id, status, checked_at DESC);

      CREATE OR REPLACE FUNCTION enforce_transaction_provider_owner()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM transactions
           WHERE id = NEW.transaction_id AND user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'transaction provider detail owner mismatch';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER transaction_provider_details_owner
        BEFORE INSERT OR UPDATE ON transaction_provider_details
        FOR EACH ROW EXECUTE FUNCTION enforce_transaction_provider_owner();

      CREATE OR REPLACE FUNCTION enforce_reconciliation_anchor_owner()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.anchor_transaction_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM transactions
           WHERE id = NEW.anchor_transaction_id AND user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'reconciliation anchor owner mismatch';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER account_reconciliations_anchor_owner
        BEFORE INSERT OR UPDATE ON account_reconciliations
        FOR EACH ROW EXECUTE FUNCTION enforce_reconciliation_anchor_owner();
    `);
  },
};
