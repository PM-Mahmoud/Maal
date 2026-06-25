/**
 * DB module — owns: waitlist_emails table queries
 * Does NOT own: user auth tables, route logic, email sending
 */
// Shared pool singleton (db/pool.js)
const pool = require('./pool');

/**
 * Insert email into waitlist. Returns true if newly inserted, false if duplicate.
 */
async function saveWaitlistEmail(email) {
  const result = await pool.query(
    `INSERT INTO waitlist_emails (email) VALUES ($1)
     ON CONFLICT (LOWER(email)) DO NOTHING
     RETURNING id`,
    [email]
  );
  return result.rowCount > 0;
}

module.exports = { saveWaitlistEmail };
