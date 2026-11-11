'use strict';

// Tier 3 PR 1 (specs/silvia-parity-tier3.md › D4) — model-training consent log.
// Append-only: every grant / opt-out / notice acknowledgement is a new row, so
// eligibility can be decided for any past instant (lib/training-consent.js).
// Additive only; references users but does not alter it.
module.exports = {
  name: 'training_consents',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_consents (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL CHECK (scope IN ('general','cdr')),
        granted BOOLEAN NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('signup','signup_google','notice','settings')),
        policy_version TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_training_consents_user
        ON training_consents (user_id, scope, created_at DESC);
    `);
  },
};
