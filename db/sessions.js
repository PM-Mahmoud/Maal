// db/sessions.js
// Server-side session revocation over the connect-pg-simple `session` table.
// Rows only — the table's schema is never touched here.

const pool = require('./pool');

// Sign a user out everywhere (e.g. after a password reset), optionally keeping
// one session (the browser that made the change). Filters by the userId stored
// in the session JSON, so it can only ever delete that user's sessions.
// Returns the number of sessions removed.
async function destroyUserSessions(userId, keepSid = null) {
  if (userId === undefined || userId === null || userId === '') return 0;
  const result = await pool.query(
    `DELETE FROM session
      WHERE sess->>'userId' = $1::text
        AND ($2::text IS NULL OR sid <> $2::text)`,
    [String(userId), keepSid || null]
  );
  return result.rowCount || 0;
}

module.exports = { destroyUserSessions };
