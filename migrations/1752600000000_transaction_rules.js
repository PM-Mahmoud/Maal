// HUMAN REVIEW REQUIRED before applying to production: although this migration
// only CREATEs new tables, both FK-reference the protected `users` and
// `transactions` tables. Per the repo policy, a human must review it and it must
// not be auto-applied blind. CHECK constraints below mirror the exact literals
// enforced in services/transaction-rules.js + lib/transaction-categories.js, so
// a bypassed/faulty API can't persist a rule the engine can't evaluate.
module.exports = {
  name: 'transaction_rules',
  up: async (client) => {
    // User-authored auto-categorisation rules + the resulting per-transaction
    // categories. Both additive; category is kept OUT of the protected
    // `transactions` table (categories live here, FK-referencing it) so this
    // migration never ALTERs transactions/users/session/linked_accounts.
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_rules (
        id             BIGSERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           TEXT,
        match_type     TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','starts_with','equals')),
        match_text     TEXT NOT NULL,
        category_group TEXT NOT NULL,
        category       TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_rules_user ON transaction_rules(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS transaction_categories (
        transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_group TEXT NOT NULL,
        category       TEXT,
        source         TEXT NOT NULL DEFAULT 'rule' CHECK (source IN ('rule','manual','auto')),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_categories_user ON transaction_categories(user_id);
    `);
  },
};
