/**
 * DB module — owns: waitlist_emails table queries
 * Does NOT own: user auth tables, route logic, email sending
 */
const { Pool } = require('pg');

// Single pool instance for this module — only db/ may construct Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

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
