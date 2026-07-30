module.exports = {
  name: 'connection_health',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS provider_connection_health (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown'
          CHECK (status IN ('unknown','healthy','degraded','expiring','reauthorization_required')),
        provider_status TEXT,
        consent_expires_at TIMESTAMPTZ,
        last_checked_at TIMESTAMPTZ,
        last_success_at TIMESTAMPTZ,
        last_failure_at TIMESTAMPTZ,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_provider_connection_health_status
        ON provider_connection_health(status, consent_expires_at);
    `);
  },
};
