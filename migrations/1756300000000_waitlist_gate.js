/**
 * Migration: waitlist_gate
 *
 * Extends waitlist_emails for the invite-only launch: contact consent, where
 * the signup came from (website / event tag), invite status, and an optional
 * score from the kiosk / score calculator. Additive only — no existing column
 * changes, and none of the protected tables (users, linked_accounts,
 * transactions, session) are touched.
 */
module.exports = {
  name: 'waitlist_gate',
  up: async (client) => {
    await client.query(`
      ALTER TABLE waitlist_emails
        ADD COLUMN IF NOT EXISTS name            VARCHAR(100),
        ADD COLUMN IF NOT EXISTS consent_contact BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS consent_at      TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS source          VARCHAR(40) NOT NULL DEFAULT 'website',
        ADD COLUMN IF NOT EXISTS status          VARCHAR(16) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS invited_at      TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS joined_at       TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS score           SMALLINT
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_emails_status_check') THEN
          ALTER TABLE waitlist_emails
            ADD CONSTRAINT waitlist_emails_status_check CHECK (status IN ('pending', 'invited', 'joined'));
        END IF;
      END $$;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS waitlist_emails_status_idx ON waitlist_emails (status, created_at)`);
  },
};
