module.exports = {
  name: 'category_learning',
  up: async (client) => {
    await client.query(`
      ALTER TABLE transaction_rules
        ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS amount_direction TEXT NOT NULL DEFAULT 'any'
          CHECK (amount_direction IN ('any','debit','credit'));
      CREATE INDEX IF NOT EXISTS idx_transaction_rules_precedence
        ON transaction_rules(user_id, priority DESC, created_at ASC, id ASC);

      CREATE TABLE IF NOT EXISTS transaction_category_feedback (
        transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        merchant_key TEXT NOT NULL,
        amount_direction TEXT NOT NULL CHECK (amount_direction IN ('debit','credit')),
        category_group TEXT NOT NULL,
        category TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_category_feedback_merchant
        ON transaction_category_feedback(user_id, merchant_key, amount_direction);

      CREATE OR REPLACE FUNCTION enforce_category_feedback_owner()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM transactions
           WHERE id = NEW.transaction_id AND user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'transaction category feedback owner mismatch';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS transaction_category_feedback_owner
        ON transaction_category_feedback;
      CREATE TRIGGER transaction_category_feedback_owner
        BEFORE INSERT OR UPDATE ON transaction_category_feedback
        FOR EACH ROW EXECUTE FUNCTION enforce_category_feedback_owner();
    `);
  },
};
