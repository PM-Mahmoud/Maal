module.exports = {
  name: 'background_jobs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        queue TEXT NOT NULL DEFAULT 'default',
        job_type TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key TEXT,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued','running','succeeded','dead','cancelled')),
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_by TEXT,
        locked_at TIMESTAMPTZ,
        lease_expires_at TIMESTAMPTZ,
        last_error TEXT,
        result JSONB,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_idempotency
        ON background_jobs(queue, job_type, COALESCE(user_id, 0), idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
        ON background_jobs(queue, status, priority DESC, run_at, id);
      CREATE INDEX IF NOT EXISTS idx_background_jobs_user
        ON background_jobs(user_id, created_at DESC)
        WHERE user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_background_jobs_lease
        ON background_jobs(status, lease_expires_at)
        WHERE status = 'running';
    `);
  },
};
