// Stores Basiq transactions pulled during /basiq/sync so the dashboard and
// transactions page can show them without hitting the Basiq API on every load.
module.exports = {
  name: 'transactions',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        basiq_id TEXT UNIQUE,
        description TEXT,
        amount NUMERIC DEFAULT 0,
        status TEXT,
        post_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS transactions_user_date_idx
        ON transactions (user_id, post_date DESC);
    `);
  },
};
