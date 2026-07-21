// db/feedback.js
// In-app feedback submissions (Settings → sidebar "Share Feedback").

const { pool } = require('./auth');

async function addFeedback(userId, message, page) {
  await pool.query(
    `INSERT INTO feedback (user_id, message, page) VALUES ($1, $2, $3)`,
    [userId || null, message, page || null]
  );
}

// Recent submissions for the admin dashboard, newest first, with the submitter's
// email joined in. This is the ONLY read path for feedback — before it existed,
// anything submitted (including the whole pre-email-notification backlog) was
// only visible via a direct Postgres query.
async function getRecentFeedback(limit = 100) {
  const result = await pool.query(
    `SELECT f.id, f.message, f.page, f.created_at, u.email
     FROM feedback f
     LEFT JOIN users u ON u.id = f.user_id
     ORDER BY f.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = { addFeedback, getRecentFeedback };
