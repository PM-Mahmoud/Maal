module.exports = {
  name: 'import_runs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS import_runs (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        request_key TEXT NOT NULL,
        background_job_id BIGINT UNIQUE REFERENCES background_jobs(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued','running','retrying','succeeded','dead')),
        current_stage TEXT,
        active_attempt_token TEXT,
        active_worker_id TEXT,
        active_job_attempt INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        progress JSONB NOT NULL DEFAULT '{}'::jsonb,
        checkpoints JSONB NOT NULL DEFAULT '{}'::jsonb,
        summary JSONB,
        last_error TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, provider, request_key)
      );
      CREATE INDEX IF NOT EXISTS idx_import_runs_user
        ON import_runs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_import_runs_status
        ON import_runs(status, updated_at)
        WHERE status IN ('queued','running','retrying');
    `);
  },
};
