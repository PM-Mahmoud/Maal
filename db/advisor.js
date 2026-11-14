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

// ─── Advisor workspace threads (favourite / rename / delete) ────────────────
// Every query below filters by user_id IN THE SQL itself (ownership check —
// Maal has no RLS). Missing `AND user_id = $N` would be an IDOR bug.

const THREAD_COLS = 'id, title, is_favourite, created_at, updated_at';

async function listThreads(userId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT ${THREAD_COLS} FROM advisor_sessions
     WHERE user_id = $1
     ORDER BY is_favourite DESC, favourited_at DESC NULLS LAST, updated_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function createThread(userId, title) {
  const { rows } = await pool.query(
    `INSERT INTO advisor_sessions (user_id, title) VALUES ($1, $2) RETURNING ${THREAD_COLS}`,
    [userId, title]
  );
  return rows[0];
}

async function getThread(threadId, userId) {
  const { rows } = await pool.query(
    `SELECT ${THREAD_COLS} FROM advisor_sessions WHERE id = $1 AND user_id = $2`,
    [threadId, userId]
  );
  return rows[0] || null;
}

/** Messages with their rich parts; null when the thread isn't the user's. */
async function getThreadMessages(threadId, userId) {
  const thread = await getThread(threadId, userId);
  if (!thread) return null;
  const { rows } = await pool.query(
    `SELECT m.id, m.role, m.content, m.meta, m.created_at
     FROM advisor_messages m
     JOIN advisor_sessions s ON s.id = m.session_id
     WHERE m.session_id = $1 AND s.user_id = $2
     ORDER BY m.created_at ASC, m.id ASC`,
    [threadId, userId]
  );
  return { thread, messages: rows };
}

async function renameThread(threadId, userId, title) {
  const { rows } = await pool.query(
    `UPDATE advisor_sessions SET title = $3
     WHERE id = $1 AND user_id = $2
     RETURNING ${THREAD_COLS}`,
    [threadId, userId, title]
  );
  return rows[0] || null;
}

async function setFavourite(threadId, userId, favourite) {
  const { rows } = await pool.query(
    `UPDATE advisor_sessions
     SET is_favourite = $3, favourited_at = CASE WHEN $3 THEN NOW() ELSE NULL END
     WHERE id = $1 AND user_id = $2
     RETURNING ${THREAD_COLS}`,
    [threadId, userId, !!favourite]
  );
  return rows[0] || null;
}

/** Hard-deletes the thread (messages cascade). Returns true when a row was removed. */
async function deleteThread(threadId, userId) {
  const { rowCount } = await pool.query(
    `DELETE FROM advisor_sessions WHERE id = $1 AND user_id = $2`,
    [threadId, userId]
  );
  return rowCount > 0;
}

/**
 * Append validated messages to a thread the user owns. When `autoTitle` is
 * given, it replaces the default/blank title (first message names the chat)
 * but never overwrites a title the user chose. Returns the updated thread, or
 * null when the thread isn't the user's (nothing is written).
 */
async function appendThreadMessages(threadId, userId, messages, { autoTitle = null, defaultTitle = 'New chat' } = {}) {
  const { rows } = await pool.query(
    `UPDATE advisor_sessions
     SET updated_at = NOW(),
         title = CASE WHEN $3::text IS NOT NULL AND (title IS NULL OR title = '' OR title = $4) THEN $3 ELSE title END
     WHERE id = $1 AND user_id = $2
     RETURNING ${THREAD_COLS}`,
    [threadId, userId, autoTitle, defaultTitle]
  );
  if (!rows[0]) return null;
  for (const m of messages) {
    await pool.query(
      `INSERT INTO advisor_messages (session_id, role, content, meta)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM advisor_sessions WHERE id = $1 AND user_id = $5)`,
      [threadId, m.role, m.content, m.meta ? JSON.stringify(m.meta) : null, userId]
    );
  }
  return rows[0];
}

module.exports = {
  createSession, appendMessage, getMessages, listSessions, deleteSession,
  listThreads, createThread, getThread, getThreadMessages, renameThread, setFavourite, deleteThread, appendThreadMessages,
};
