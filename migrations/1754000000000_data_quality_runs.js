// Records every quality evaluation, including clean runs with no findings.
// Additive-only and user-scoped.
module.exports = {
  name: 'data_quality_runs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_quality_runs (
        id            BIGSERIAL PRIMARY KEY,
        user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        trigger       TEXT NOT NULL,
        status        TEXT NOT NULL
                        CHECK (status IN ('healthy', 'attention', 'critical', 'incomplete', 'failed')),
        error_count   INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
        warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
        info_count    INTEGER NOT NULL DEFAULT 0 CHECK (info_count >= 0),
        coverage      JSONB NOT NULL DEFAULT '{}'::jsonb,
        message       TEXT,
        checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_data_quality_runs_user
        ON data_quality_runs(user_id, checked_at DESC);
    `);
  },
};
