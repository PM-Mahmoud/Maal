'use strict';

module.exports = {
  name: 'wealth_imports_and_links',
  up: async (client) => {
    await client.query(`
      ALTER TABLE instruments ADD COLUMN IF NOT EXISTS match_key TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_user_match_key
        ON instruments(user_id, match_key) WHERE match_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_accounts_external_reference
        ON financial_accounts(user_id, source, external_reference)
        WHERE external_reference IS NOT NULL;

      ALTER TABLE valuations ADD COLUMN IF NOT EXISTS presentation_amount_minor BIGINT;
      ALTER TABLE valuations ADD COLUMN IF NOT EXISTS presentation_currency CHAR(3);
      ALTER TABLE valuations ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(20,10);
      ALTER TABLE valuations ADD COLUMN IF NOT EXISTS fx_source TEXT;
      ALTER TABLE valuations ADD COLUMN IF NOT EXISTS fx_as_of TIMESTAMPTZ;
      DO $$ BEGIN
        ALTER TABLE valuations ADD CONSTRAINT valuations_fx_complete CHECK (
          currency = 'AUD' OR
          (presentation_amount_minor IS NOT NULL AND presentation_currency = 'AUD'
            AND fx_rate IS NOT NULL AND fx_rate > 0 AND fx_source IS NOT NULL AND fx_as_of IS NOT NULL)
        ) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS canonical_account_links (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_account_id TEXT NOT NULL,
        financial_account_id BIGINT NOT NULL,
        match_method TEXT NOT NULL CHECK (match_method IN ('manual','provider_reference','exact_metadata','import')),
        confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ignored','needs_review','revoked')),
        last_seen_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, provider, external_account_id),
        FOREIGN KEY (financial_account_id, user_id) REFERENCES financial_accounts(id, user_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_canonical_account_links_account
        ON canonical_account_links(user_id, financial_account_id);

      CREATE TABLE IF NOT EXISTS wealth_statement_imports (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        statement_id TEXT NOT NULL,
        source_hash CHAR(64) NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('brokerage','super')),
        account_name TEXT NOT NULL,
        as_of TIMESTAMPTZ NOT NULL,
        raw_csv TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, statement_id, source_hash),
        UNIQUE (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wealth_statement_imports_user
        ON wealth_statement_imports(user_id, created_at DESC);
      DROP TRIGGER IF EXISTS wealth_statement_imports_append_only ON wealth_statement_imports;
      CREATE TRIGGER wealth_statement_imports_append_only
        BEFORE UPDATE OR DELETE ON wealth_statement_imports
        FOR EACH ROW EXECUTE FUNCTION reject_valuation_mutation();
    `);
  },
};
