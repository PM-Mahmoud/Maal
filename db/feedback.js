// db/feedback.js
// In-app feedback submissions (Settings → sidebar "Share Feedback").

const { pool } = require('./auth');

async function addFeedback(userId, message, page) {
  await pool.query(
    `INSERT INTO feedback (user_id, message, page) VALUES ($1, $2, $3)`,
    [userId || null, message, page || null]
  );
}

module.exports = { addFeedback };
