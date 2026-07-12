module.exports = {
  name: 'user_widgets',
  up: async (client) => {
    // Widgets a user saved from Ask Maal to their dashboard. We store the
    // spec (source + title), NOT frozen data — the source is re-run live from
    // the user's current data when the dashboard loads. Additive table; only
    // FK-references users(id).
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_widgets (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source      TEXT NOT NULL,
        title       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_widgets_user ON user_widgets(user_id, created_at DESC);
    `);
  },
};
