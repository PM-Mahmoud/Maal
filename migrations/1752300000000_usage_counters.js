module.exports = {
  name: 'usage_counters',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_counters (
        user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature     TEXT NOT NULL,
        period      TEXT NOT NULL,
        used        INTEGER NOT NULL DEFAULT 0,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, feature, period)
      );
    `);
  },
};
