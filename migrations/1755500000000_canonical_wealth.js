'use strict';

module.exports = {
  name: 'canonical_wealth',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_accounts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_type TEXT NOT NULL CHECK (account_type IN ('cash','brokerage','super','crypto_wallet','liability','other')),
        name TEXT NOT NULL,
        institution TEXT,
        external_reference TEXT,
        currency CHAR(3) NOT NULL DEFAULT 'AUD',
        source TEXT NOT NULL DEFAULT 'manual',
        confidence NUMERIC(4,3) NOT NULL DEFAULT 0.700 CHECK (confidence >= 0 AND confidence <= 1),
        as_of TIMESTAMPTZ NOT NULL,
        legacy_key TEXT,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, legacy_key),
        UNIQUE (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON financial_accounts(user_id);

      CREATE TABLE IF NOT EXISTS instruments (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        instrument_type TEXT NOT NULL DEFAULT 'other',
        ticker TEXT,
        isin TEXT,
        apir TEXT,
        exchange TEXT,
        currency CHAR(3) NOT NULL DEFAULT 'AUD',
        legacy_key TEXT,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, legacy_key),
        UNIQUE (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_instruments_user ON instruments(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_user_isin ON instruments(user_id, isin) WHERE isin IS NOT NULL;

      CREATE TABLE IF NOT EXISTS holdings (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        financial_account_id BIGINT NOT NULL,
        instrument_id BIGINT NOT NULL,
        units NUMERIC(28,10) NOT NULL DEFAULT 0,
        cost_basis_minor BIGINT NOT NULL DEFAULT 0,
        currency CHAR(3) NOT NULL DEFAULT 'AUD',
        as_of TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        confidence NUMERIC(4,3) NOT NULL DEFAULT 0.700 CHECK (confidence >= 0 AND confidence <= 1),
        legacy_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, legacy_key),
        UNIQUE (user_id, financial_account_id, instrument_id, as_of),
        FOREIGN KEY (financial_account_id, user_id) REFERENCES financial_accounts(id, user_id) ON DELETE CASCADE,
        FOREIGN KEY (instrument_id, user_id) REFERENCES instruments(id, user_id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_holdings_user_account ON holdings(user_id, financial_account_id);

      CREATE TABLE IF NOT EXISTS valuations (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_type TEXT NOT NULL CHECK (subject_type IN ('financial_account','holding','property','other_asset','liability')),
        subject_key TEXT NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN ('cash','investment','property','property_mortgage','debt','super','other_asset')),
        amount_minor BIGINT NOT NULL,
        currency CHAR(3) NOT NULL,
        as_of TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL,
        confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        legacy_key TEXT,
        supersedes_id BIGINT REFERENCES valuations(id) ON DELETE RESTRICT,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, legacy_key)
      );
      CREATE INDEX IF NOT EXISTS idx_valuations_user_subject_asof ON valuations(user_id, subject_type, subject_key, classification, as_of DESC);

      CREATE TABLE IF NOT EXISTS ownership_interests (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_type TEXT NOT NULL CHECK (subject_type IN ('financial_account','holding','property','other_asset','liability')),
        subject_key TEXT NOT NULL,
        owner_type TEXT NOT NULL DEFAULT 'self' CHECK (owner_type IN ('self','joint','trust','company','other')),
        owner_label TEXT,
        ownership_percent NUMERIC(7,4) NOT NULL CHECK (ownership_percent > 0 AND ownership_percent <= 100),
        ownership_structure TEXT,
        effective_from TIMESTAMPTZ NOT NULL,
        effective_to TIMESTAMPTZ,
        legacy_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, legacy_key)
      );
      CREATE INDEX IF NOT EXISTS idx_ownership_user_subject ON ownership_interests(user_id, subject_type, subject_key);

      CREATE OR REPLACE FUNCTION reject_valuation_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'valuations are append-only; insert a superseding valuation';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS valuations_append_only_update ON valuations;
      CREATE TRIGGER valuations_append_only_update
        BEFORE UPDATE OR DELETE ON valuations
        FOR EACH ROW EXECUTE FUNCTION reject_valuation_mutation();
    `);

    // Backfill inside the migration transaction. A parity mismatch aborts the
    // deployment rather than letting consumers see divergent financial truth.
    const { projectLegacyWealthRows, compareLegacyAndCanonical } = require('../lib/canonical-wealth');
    const { loadLegacyRows, persistProjection, loadCanonicalProjection } = require('../scripts/backfill-canonical-wealth');
    const { rows: users } = await client.query(`
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM cash_accounts UNION ALL SELECT user_id FROM investments
        UNION ALL SELECT user_id FROM properties UNION ALL SELECT user_id FROM debts
        UNION ALL SELECT user_id FROM super_accounts UNION ALL SELECT user_id FROM other_assets
      ) wealth_users ORDER BY user_id
    `);
    for (const { user_id: userId } of users) {
      const legacy = await loadLegacyRows(client, userId);
      await persistProjection(client, projectLegacyWealthRows(userId, legacy));
      const parity = compareLegacyAndCanonical(legacy, await loadCanonicalProjection(client, userId));
      if (!parity.matches) throw new Error(`canonical wealth parity failed for user ${userId}: delta=${parity.delta}`);
    }
  },
};
