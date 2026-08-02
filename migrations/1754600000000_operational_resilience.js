module.exports = {
  name: 'operational_resilience',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS operational_alerts (
        id BIGSERIAL PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
        category TEXT NOT NULL,
        summary TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_delivered_at TIMESTAMPTZ,
        delivery_attempts INTEGER NOT NULL DEFAULT 0,
        last_delivery_error TEXT,
        delivery_claim_token TEXT,
        delivery_claimed_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_alerts_open
        ON operational_alerts(fingerprint) WHERE status = 'open';
      CREATE INDEX IF NOT EXISTS idx_operational_alerts_status
        ON operational_alerts(status, severity, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS backup_verification_runs (
        id BIGSERIAL PRIMARY KEY,
        target_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','not_configured')),
        checks JSONB NOT NULL DEFAULT '{}'::jsonb,
        error TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_backup_verification_runs_latest
        ON backup_verification_runs(started_at DESC);

      CREATE TABLE IF NOT EXISTS backup_source_markers (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generation BIGINT NOT NULL DEFAULT 1,
        users_count BIGINT NOT NULL DEFAULT 0,
        raw_records_count BIGINT NOT NULL DEFAULT 0,
        transactions_count BIGINT NOT NULL DEFAULT 0,
        linked_accounts_count BIGINT NOT NULL DEFAULT 0,
        cash_accounts_count BIGINT NOT NULL DEFAULT 0,
        investments_count BIGINT NOT NULL DEFAULT 0,
        debts_count BIGINT NOT NULL DEFAULT 0,
        properties_count BIGINT NOT NULL DEFAULT 0,
        marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO backup_source_markers
        (id, users_count, raw_records_count, transactions_count,
         linked_accounts_count, cash_accounts_count, investments_count,
         debts_count, properties_count)
      SELECT 1,
        (SELECT COUNT(*) FROM users),
        (SELECT COUNT(*) FROM raw_financial_records),
        (SELECT COUNT(*) FROM transactions),
        (SELECT COUNT(*) FROM linked_accounts),
        (SELECT COUNT(*) FROM cash_accounts),
        (SELECT COUNT(*) FROM investments),
        (SELECT COUNT(*) FROM debts),
        (SELECT COUNT(*) FROM properties)
      ON CONFLICT (id) DO NOTHING;
    `);
  },
};
