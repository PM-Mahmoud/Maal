// HUMAN REVIEW REQUIRED before applying to production: this migration only
// CREATEs new side tables, but they FK-reference the protected `users` and
// `transactions` tables. Per repo policy a human reviews it first.
//
// Redesign session 2 "Transaction detail & editing" (HEL-96..103). Per-
// transaction data the user edits lives OUT of the protected `transactions`
// table (never ALTERed):
//   transaction_meta   — reviewed / hidden / note / renamed merchant / description
//   tags               — user-scoped tag catalogue (name + colour key)
//   transaction_tags   — tag assignments
//   transaction_splits — a transaction split into parts; the API only writes
//                        sets whose amounts sum to the original
//                        (shared/transaction-splits.mjs validateSplits).
module.exports = {
  name: 'transaction_detail',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_meta (
        transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewed_at    TIMESTAMPTZ,
        hidden         BOOLEAN NOT NULL DEFAULT FALSE,
        note           TEXT CHECK (note IS NULL OR char_length(note) <= 500),
        merchant_name  TEXT CHECK (merchant_name IS NULL OR char_length(merchant_name) <= 120),
        description    TEXT CHECK (description IS NULL OR char_length(description) <= 240),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_meta_user ON transaction_meta(user_id);

      CREATE TABLE IF NOT EXISTS tags (
        id         BIGSERIAL PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
        color      TEXT NOT NULL DEFAULT 'sand',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_user_name ON tags(user_id, lower(name));

      CREATE TABLE IF NOT EXISTS transaction_tags (
        transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        tag_id         BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (transaction_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_tags_user ON transaction_tags(user_id);

      CREATE TABLE IF NOT EXISTS transaction_splits (
        id             BIGSERIAL PRIMARY KEY,
        transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        position       INTEGER NOT NULL,
        amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
        category_group TEXT NOT NULL,
        category       TEXT,
        hidden         BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (transaction_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_splits_user ON transaction_splits(user_id, transaction_id);
    `);
  },
};
