// Additive financial-integrity foundation.
//
// Raw evidence is immutable at the database boundary. Direct UPDATE/DELETE is
// rejected, while the users FK cascade remains available for account erasure.
module.exports = {
  name: 'financial_integrity',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS raw_financial_records (
        id               BIGSERIAL PRIMARY KEY,
        user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source           TEXT NOT NULL,
        entity_type      TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        payload          JSONB NOT NULL,
        payload_hash     TEXT NOT NULL,
        observed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, source, entity_type, source_record_id, payload_hash),
        UNIQUE (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_raw_financial_records_lookup
        ON raw_financial_records(user_id, source, entity_type, source_record_id, observed_at DESC);

      CREATE TABLE IF NOT EXISTS calculation_audits (
        id                  BIGSERIAL PRIMARY KEY,
        user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        calculation_type    TEXT NOT NULL,
        calculation_version TEXT NOT NULL,
        effective_at        TIMESTAMPTZ NOT NULL,
        inputs              JSONB NOT NULL,
        assumptions         JSONB NOT NULL DEFAULT '{}'::jsonb,
        result              JSONB NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_calculation_audits_user_type
        ON calculation_audits(user_id, calculation_type, effective_at DESC);

      CREATE TABLE IF NOT EXISTS calculation_audit_sources (
        calculation_audit_id BIGINT NOT NULL,
        raw_record_id        BIGINT NOT NULL,
        user_id              BIGINT NOT NULL,
        PRIMARY KEY (calculation_audit_id, raw_record_id),
        FOREIGN KEY (calculation_audit_id, user_id)
          REFERENCES calculation_audits(id, user_id) ON DELETE CASCADE,
        FOREIGN KEY (raw_record_id, user_id)
          REFERENCES raw_financial_records(id, user_id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS data_quality_findings (
        id              BIGSERIAL PRIMARY KEY,
        user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        check_code      TEXT NOT NULL,
        entity_type     TEXT NOT NULL,
        entity_key      TEXT NOT NULL DEFAULT '',
        severity        TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
        status          TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'resolved', 'ignored')),
        summary         TEXT NOT NULL,
        details         JSONB NOT NULL DEFAULT '{}'::jsonb,
        first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        UNIQUE (user_id, check_code, entity_type, entity_key)
      );
      CREATE INDEX IF NOT EXISTS idx_data_quality_findings_open
        ON data_quality_findings(user_id, status, severity, last_seen_at DESC);

      CREATE OR REPLACE FUNCTION protect_raw_financial_record()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          RAISE EXCEPTION 'raw financial records are immutable';
        END IF;
        -- A direct delete still has a live parent user. During the FK cascade
        -- caused by account erasure, that parent row is no longer visible.
        IF TG_OP = 'DELETE'
           AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
          RAISE EXCEPTION 'raw financial records may only be deleted with their user';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS raw_financial_records_immutable ON raw_financial_records;
      CREATE TRIGGER raw_financial_records_immutable
        BEFORE UPDATE OR DELETE ON raw_financial_records
        FOR EACH ROW EXECUTE FUNCTION protect_raw_financial_record();
    `);
  },
};
