'use strict';

module.exports = {
  name: 'wealth_services_marketplace',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS methodology_packs (
        id BIGSERIAL PRIMARY KEY, service_type TEXT NOT NULL CHECK (service_type IN ('zakat','purification')),
        methodology_key TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_review'
          CHECK (status IN ('draft','pending_review','approved','retired')),
        config JSONB NOT NULL, reviewer_name TEXT, reviewed_at TIMESTAMPTZ, sources JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(service_type,methodology_key,version)
      );
      CREATE TABLE IF NOT EXISTS service_runs (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_type TEXT NOT NULL CHECK (service_type IN ('zakat','purification')),
        methodology_key TEXT NOT NULL, methodology_version TEXT NOT NULL, methodology_review_status TEXT NOT NULL,
        input_snapshot JSONB NOT NULL, snapshot_hash CHAR(64) NOT NULL, result JSONB NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('calculated','needs_confirmation','unavailable')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(id,user_id)
      );
      INSERT INTO methodology_packs(service_type,methodology_key,version,status,config,sources) VALUES
        ('zakat','maal-zakat-au-lunar','1.0.0','pending_review','{"yearBasis":"lunar","ratePartsPerMillion":25000,"nisabBasis":"user_confirmed_aud_minor","valuationDateRule":"user_selected_snapshot","ownershipRule":"percentage_interest","rules":{"eligibleCategories":["cash","listed_shares","business_inventory","gold","silver","crypto"],"debtDueWithinMonths":12}}'::jsonb,'[]'::jsonb),
        ('zakat','maal-zakat-au-solar','1.0.0','pending_review','{"yearBasis":"solar","ratePartsPerMillion":25775,"nisabBasis":"user_confirmed_aud_minor","valuationDateRule":"user_selected_snapshot","ownershipRule":"percentage_interest","rules":{"eligibleCategories":["cash","listed_shares","business_inventory","gold","silver","crypto"],"debtDueWithinMonths":12}}'::jsonb,'[]'::jsonb),
        ('purification','maal-distribution-purification','1.0.0','pending_review','{"ratioRequirement":"licensed_provider_evidence"}'::jsonb,'[]'::jsonb)
      ON CONFLICT(service_type,methodology_key,version) DO NOTHING;
      CREATE TABLE IF NOT EXISTS purification_ratio_datasets (
        id BIGSERIAL PRIMARY KEY, security_key TEXT NOT NULL, ratio_parts_per_million INTEGER NOT NULL CHECK(ratio_parts_per_million BETWEEN 0 AND 1000000),
        provider TEXT NOT NULL, dataset_version TEXT NOT NULL, license_reference TEXT NOT NULL, ratio_as_of DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')), approved_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(security_key,dataset_version)
      );
      CREATE TABLE IF NOT EXISTS service_run_lines (
        id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL, user_id BIGINT NOT NULL, line_key TEXT NOT NULL,
        line_type TEXT NOT NULL, evidence JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY(run_id,user_id) REFERENCES service_runs(id,user_id) ON DELETE CASCADE, UNIQUE(run_id,line_key)
      );
      CREATE TABLE IF NOT EXISTS service_reminders (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_type TEXT NOT NULL, due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled'
          CHECK(status IN ('scheduled','sent','cancelled')), source_run_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS purification_obligations (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        run_id BIGINT NOT NULL, obligation_key TEXT NOT NULL, security_key TEXT NOT NULL,
        amount_due_minor BIGINT NOT NULL CHECK(amount_due_minor >= 0), currency CHAR(3) NOT NULL DEFAULT 'AUD',
        status TEXT NOT NULL DEFAULT 'outstanding' CHECK(status IN ('outstanding','satisfied')),
        satisfied_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY(run_id,user_id) REFERENCES service_runs(id,user_id) ON DELETE CASCADE, UNIQUE(user_id,obligation_key), UNIQUE(id,user_id)
      );
      CREATE TABLE IF NOT EXISTS purification_obligation_events (
        id BIGSERIAL PRIMARY KEY, obligation_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_type TEXT NOT NULL CHECK(event_type IN ('created','satisfied','reopened')),
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY(obligation_id,user_id) REFERENCES purification_obligations(id,user_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS marketplace_governance (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton), marketplace_approved BOOLEAN NOT NULL DEFAULT FALSE,
        approved_by TEXT, approved_at TIMESTAMPTZ, commercial_terms_version TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO marketplace_governance(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS partner_registry (
        id BIGSERIAL PRIMARY KEY, partner_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','rejected')),
        enabled BOOLEAN NOT NULL DEFAULT FALSE, sponsored BOOLEAN NOT NULL DEFAULT FALSE,
        display_rank INTEGER NOT NULL DEFAULT 1000, scopes TEXT[] NOT NULL DEFAULT '{}', fields TEXT[] NOT NULL DEFAULT '{}',
        manifest JSONB NOT NULL DEFAULT '{}'::jsonb, approved_by BIGINT REFERENCES users(id), approved_at TIMESTAMPTZ,
        health_status TEXT NOT NULL DEFAULT 'unknown' CHECK(health_status IN ('unknown','healthy','degraded','disabled')),
        sandbox_status TEXT NOT NULL DEFAULT 'pending' CHECK(sandbox_status IN ('pending','certified','failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS partner_consents (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        partner_id BIGINT NOT NULL REFERENCES partner_registry(id) ON DELETE CASCADE, scopes TEXT[] NOT NULL, fields TEXT[] NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
        expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(id,user_id)
      );
      CREATE TABLE IF NOT EXISTS partner_audit_events (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, partner_id BIGINT REFERENCES partner_registry(id) ON DELETE SET NULL,
        consent_id BIGINT, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS partner_usage_events (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        partner_id BIGINT NOT NULL REFERENCES partner_registry(id) ON DELETE CASCADE,
        consent_id BIGINT, event_type TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 1 CHECK(units > 0),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS service_runs_user_created ON service_runs(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS partner_consents_user_active ON partner_consents(user_id,status,expires_at);

      CREATE OR REPLACE FUNCTION reject_immutable_financial_evidence() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS service_runs_immutable ON service_runs;
      CREATE TRIGGER service_runs_immutable BEFORE UPDATE ON service_runs FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_evidence();
      DROP TRIGGER IF EXISTS service_run_lines_immutable ON service_run_lines;
      CREATE TRIGGER service_run_lines_immutable BEFORE UPDATE ON service_run_lines FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_evidence();
      DROP TRIGGER IF EXISTS obligation_events_immutable ON purification_obligation_events;
      CREATE TRIGGER obligation_events_immutable BEFORE UPDATE OR DELETE ON purification_obligation_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_evidence();
      DROP TRIGGER IF EXISTS partner_audit_immutable ON partner_audit_events;
      CREATE TRIGGER partner_audit_immutable BEFORE UPDATE OR DELETE ON partner_audit_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_evidence();
      DROP TRIGGER IF EXISTS partner_usage_immutable ON partner_usage_events;
      CREATE TRIGGER partner_usage_immutable BEFORE UPDATE OR DELETE ON partner_usage_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_evidence();
    `);
  }
};
