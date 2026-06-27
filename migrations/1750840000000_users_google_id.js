/**
 * Migration: users_google_id
 *
 * Adds a dedicated google_id column to users so a Google identity can be
 * linked to an existing password account independently of the legacy
 * provider/provider_id columns.  Both columns remain for compatibility.
 */
module.exports = {
  name: 'users_google_id',
  up: async (client) => {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_google_id
        ON users(google_id) WHERE google_id IS NOT NULL;
    `);
  },
};
