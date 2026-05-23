// db/onboarding.js
// Query functions for onboarding_responses and onboarding_sessions tables.
// Does NOT own Pool construction — pool is required at module load.

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function createSession(userId) {
  const result = await pool.query(
    `INSERT INTO onboarding_sessions (user_id)
     VALUES ($1)
     RETURNING id, current_step, is_complete, last_active_at, created_at`,
    [userId]
  );
  return result.rows[0];
}

async function getSessionByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id, current_step, is_complete, last_active_at, created_at
     FROM onboarding_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function updateSessionStep(sessionId, step) {
  await pool.query(
    `UPDATE onboarding_sessions
     SET current_step = $2, last_active_at = NOW()
     WHERE id = $1`,
    [sessionId, step]
  );
}

async function completeSession(sessionId) {
  await pool.query(
    `UPDATE onboarding_sessions
     SET is_complete = true, last_active_at = NOW()
     WHERE id = $1`,
    [sessionId]
  );
}

// ─── Responses ─────────────────────────────────────────────────────────────────

async function upsertResponse(sessionId, step, data) {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const assignments = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');

  const result = await pool.query(
    `INSERT INTO onboarding_responses (session_id, step, ${fields.join(', ')}, updated_at)
     VALUES ($1, $2, ${values.map((_, i) => `$${i + 3}`).join(', ')}, NOW())
     ON CONFLICT (session_id, step)
     DO UPDATE SET ${assignments}, updated_at = NOW()
     RETURNING id`,
    [sessionId, step, ...values]
  );
  return result.rows[0];
}

async function getResponsesBySession(sessionId) {
  const result = await pool.query(
    `SELECT * FROM onboarding_responses
     WHERE session_id = $1
     ORDER BY step ASC`,
    [sessionId]
  );
  return result.rows;
}

async function getFullProfileByUserId(userId) {
  const result = await pool.query(
    `SELECT r.* FROM onboarding_responses r
     JOIN onboarding_sessions s ON r.session_id = s.id
     WHERE s.user_id = $1 AND r.is_complete = true
     ORDER BY r.step ASC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getResponseByStep(sessionId, step) {
  const result = await pool.query(
    `SELECT * FROM onboarding_responses
     WHERE session_id = $1 AND step = $2`,
    [sessionId, step]
  );
  return result.rows[0] || null;
}

async function markResponseComplete(sessionId) {
  await pool.query(
    `UPDATE onboarding_responses
     SET is_complete = true, completed_at = NOW()
     WHERE session_id = $1`,
    [sessionId]
  );
}

module.exports = {
  createSession,
  getSessionByUserId,
  updateSessionStep,
  completeSession,
  upsertResponse,
  getResponsesBySession,
  getFullProfileByUserId,
  getResponseByStep,
  markResponseComplete,
  pool
};