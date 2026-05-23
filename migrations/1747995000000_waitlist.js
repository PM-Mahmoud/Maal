/**
 * Migration: waitlist
 *
 * Creates waitlist_emails table — email signups from the landing page.
 * Uses UNIQUE constraint on LOWER(email) to prevent duplicates.
 */
module.exports = {
  name: 'waitlist',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS waitlist_emails (
        id         SERIAL PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS waitlist_emails_lower_email_idx
        ON waitlist_emails (LOWER(email))
    `);
  },
};
