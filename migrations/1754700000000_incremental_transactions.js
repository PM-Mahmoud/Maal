module.exports = {
  name: 'incremental_transactions',
  up: async (client) => {
    await client.query(`
      ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_basiq_id_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_basiq
        ON transactions(user_id, basiq_id) WHERE basiq_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_transactions_user_status
        ON transactions(user_id, status, post_date DESC);

      CREATE TABLE IF NOT EXISTS transaction_sync_cursors (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'basiq',
        last_post_date DATE,
        last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_saved_count INTEGER NOT NULL DEFAULT 0,
        last_pending_removed INTEGER NOT NULL DEFAULT 0,
        last_pending_saved INTEGER NOT NULL DEFAULT 0
      );
    `);
  },
};
