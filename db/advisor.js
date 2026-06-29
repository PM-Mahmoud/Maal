// db/advisor.js — advisor session + message persistence for the Ask Maal chat.

const pool = require('./pool');

async function createSession(userId, firstUserMessage) {
  // Generate a title from the first 60 chars of the first message
  const title = String(firstUserMessage || 'New conversation').slice(0, 60);
  const { rows } = await pool.query(
    `INSERT INTO advisor_sessions (user_id, title) VALUES ($1, $2) RETURNING id`,
    [userId, title]
  );
  return rows[0].id;
}

async function appendMessage(sessionId, role, content) {
  await pool.query(
    `INSERT INTO advisor_messages (session_id, role, content) VALUES ($1, $2, $3)`,
    [sessionId, role, String(content)]
  );
  await pool.query(
    `UPDATE advisor_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

async function getMessages(sessionId, userId) {
  // userId check prevents IDOR
  const { rows: session } = await pool.query(
    `SELECT id FROM advisor_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  if (!session.length) return null; // not found or wrong user
  const { rows } = await pool.query(
    `SELECT role, content FROM advisor_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

async function listSessions(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, title, created_at, updated_at FROM advisor_sessions
     WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function deleteSession(sessionId, userId) {
  await pool.query(
    `DELETE FROM advisor_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
}

module.exports = { createSession, appendMessage, getMessages, listSessions, deleteSession };
