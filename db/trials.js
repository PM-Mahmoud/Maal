/**
 * DB module — owns: user_trials table queries (14-day free trial).
 * Does NOT own: access rules (lib/membership.js), plans (users.plan).
 */
const pool = require('./pool');
const { TRIAL_DAYS } = require('../lib/membership');

/**
 * The user's trial row, starting it now if they don't have one yet.
 * One round trip: insert-or-touch returns the existing row unchanged when the
 * trial already started (the conflict update is a no-op on started_at/ends_at).
 */
async function getOrStartTrial(userId) {
  const { rows } = await pool.query(
    `INSERT INTO user_trials (user_id, started_at, ends_at)
     VALUES ($1, NOW(), NOW() + ($2 || ' days')::interval)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING user_id, started_at, ends_at`,
    [userId, String(TRIAL_DAYS)]
  );
  return rows[0] || null;
}

module.exports = { getOrStartTrial };
