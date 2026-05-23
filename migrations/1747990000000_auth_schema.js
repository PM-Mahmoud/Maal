/**
 * Migration: auth_schema
 *
 * Adds auth-specific columns to the core users table (created by migrate.js).
 * Creates the Postgres session store table used by connect-pg-simple.
 */
module.exports = {
  name: 'auth_schema',
  up: async (client) => {
    // ── Auth columns on users ──────────────────────────────────────────────
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'credentials'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(255)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_exp TIMESTAMPTZ`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_exp TIMESTAMPTZ`);

    // ── Session store (connect-pg-simple) ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid    VARCHAR NOT NULL PRIMARY KEY,
        sess   JSON    NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire)
    `);
  },
};
