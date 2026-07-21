// migrations/1753000000000_maal_score_snapshots.js
// Daily Maal Score history — one row per user per day (upserted).
//
// Why a new table rather than reusing financial_scores: financial_scores is
// append-only (no per-day unique key) and is written per-page-load by the
// legacy EJS routes, so it can hold many rows for the same user on the same
// day. That makes it unsuitable for a clean daily upsert. This mirrors the
// proven net_worth_snapshots shape instead: UNIQUE(user_id, snap_date) enables
// ON CONFLICT, so recording today's score on every /api/v1/score read costs at
// most one row per user per day. Additive and non-destructive.
module.exports = {
  name: 'maal_score_snapshots',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS maal_score_snapshots (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        snap_date DATE NOT NULL DEFAULT CURRENT_DATE,
        score INTEGER NOT NULL DEFAULT 0,
        band TEXT,
        pillars JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, snap_date)
      );
      CREATE INDEX IF NOT EXISTS idx_maal_score_snapshots_user_date
        ON maal_score_snapshots (user_id, snap_date);
    `);
  }
};
