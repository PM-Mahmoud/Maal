module.exports = {
  name: 'reconciliation_adjustments',
  up: async (client) => {
    await client.query(`
      ALTER TABLE account_reconciliations
        ADD COLUMN IF NOT EXISTS adjustment_total NUMERIC NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS adjusted_balance NUMERIC,
        ADD COLUMN IF NOT EXISTS latest_adjustment_id BIGINT;
      CREATE TABLE IF NOT EXISTS account_reconciliation_adjustments (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_reference TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK (amount <> 0),
        reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
        effective_at DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reconciliation_adjustments_account
        ON account_reconciliation_adjustments(user_id, account_reference, effective_at, id);
      ALTER TABLE account_reconciliations
        ADD CONSTRAINT account_reconciliations_latest_adjustment_id_fkey
        FOREIGN KEY (latest_adjustment_id)
        REFERENCES account_reconciliation_adjustments(id) ON DELETE SET NULL;
      CREATE OR REPLACE FUNCTION protect_reconciliation_adjustment()
      RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
          RAISE EXCEPTION 'reconciliation adjustments are append-only; add a reversing adjustment';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reconciliation_adjustments_append_only
        BEFORE UPDATE OR DELETE ON account_reconciliation_adjustments
        FOR EACH ROW EXECUTE FUNCTION protect_reconciliation_adjustment();

      CREATE OR REPLACE FUNCTION enforce_reconciliation_anchor_owner()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.anchor_transaction_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM transactions
           WHERE id = NEW.anchor_transaction_id AND user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'reconciliation anchor owner mismatch';
        END IF;
        IF NEW.latest_adjustment_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM account_reconciliation_adjustments
           WHERE id = NEW.latest_adjustment_id AND user_id = NEW.user_id
             AND account_reference = NEW.account_reference
        ) THEN
          RAISE EXCEPTION 'reconciliation adjustment owner mismatch';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};
