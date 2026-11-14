/**
 * Migration: advisor_threads
 *
 * Server-side chat management for the advisor workspace (favourite, rename,
 * delete) plus persisted rich message parts. Purely additive — new defaulted /
 * nullable columns on advisor_sessions + advisor_messages. None of the
 * protected tables (users, linked_accounts, transactions, session) is touched.
 *
 *  advisor_sessions.is_favourite   — pinned to the "Favourites" group
 *  advisor_sessions.favourited_at  — ordering inside the Favourites group
 *  advisor_messages.meta           — widgets / follow-ups / citations JSON
 */
module.exports = {
  name: 'advisor_threads',
  up: async (client) => {
    await client.query(`ALTER TABLE advisor_sessions ADD COLUMN IF NOT EXISTS is_favourite BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE advisor_sessions ADD COLUMN IF NOT EXISTS favourited_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE advisor_messages ADD COLUMN IF NOT EXISTS meta JSONB`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_advisor_sessions_user_updated ON advisor_sessions(user_id, updated_at DESC)`);
  },
};
