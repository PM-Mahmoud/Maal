// Goals, Vault files (real storage in Postgres bytea), and notification prefs
// — replacing the last localStorage-only demo features.
module.exports = {
  name: 'goals_vault_prefs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'Save',
        target NUMERIC NOT NULL DEFAULT 0,
        current NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS goals_user_idx ON goals (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS vault_files (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'vault',
        filename TEXT NOT NULL,
        mime TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        content BYTEA NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS vault_user_kind_idx ON vault_files (user_id, kind, created_at DESC);

      ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}'::jsonb;
    `);
  },
};
