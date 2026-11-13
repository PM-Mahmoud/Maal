/**
 * Migration: user_trials
 *
 * 14-day free trial per user (specs/onboarding-v2-membership.md). Kept in its
 * own table so the protected `users` table is not altered — it is only
 * referenced by a foreign key (ON DELETE CASCADE, so deleting an account
 * removes its trial row too).
 *
 * Rows are created lazily the first time a user's access is checked
 * (db/trials.js getOrStartTrial), so existing accounts start their trial on
 * their first visit after deploy, and new accounts on their first request.
 */
module.exports = {
  name: 'user_trials',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_trials (
        user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at    TIMESTAMPTZ NOT NULL
      )
    `);
  },
};
