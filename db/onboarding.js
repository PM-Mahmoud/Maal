// db/onboarding.js
// Query functions for onboarding_responses and onboarding_sessions tables.
// Does NOT own Pool construction — pool is required at module load.

const pool = require('./pool');

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

// Whitelist of column names that upsertResponse may write to. Column names are
// interpolated into SQL (they cannot be parameterised), so any key not in this
// set is silently dropped to prevent SQL injection via crafted form fields.
// Keep in sync with migrations/1747996000000_onboarding.js (onboarding_responses).
const RESPONSE_COLUMNS = new Set([
  'user_id',
  'role', 'employment_type', 'years_in_practice',
  'income_range', 'hecs_balance', 'hecs_remaining', 'other_personal_debt',
  'super_balance', 'super_fund_type', 'employer_contrib_rate', 'monthly_savings', 'emergency_months',
  'investment_balance', 'brokerage_accounts', 'brokerageAccounts',
  'mortgage_balance', 'investment_property_debt', 'property_value',
  'target_retirement_age', 'goals', 'risk_tolerance',
  'is_muslim', 'prefers_halal', 'prefers_esg',
  'is_complete', 'completed_at',
]);

// Column names that are double-quoted in SQL because they are mixed-case
// (Postgres folds unquoted identifiers to lower-case).
const QUOTED_COLUMNS = new Set(['brokerageAccounts']);
const quoteCol = (c) => (QUOTED_COLUMNS.has(c) ? `"${c}"` : c);

async function upsertResponse(sessionId, step, data) {
  const fields = Object.keys(data).filter((f) => RESPONSE_COLUMNS.has(f));
  const values = fields.map((f) => data[f]);
  if (fields.length === 0) {
    // Nothing valid to write — still upsert the (session_id, step) skeleton row.
    const result = await pool.query(
      `INSERT INTO onboarding_responses (session_id, step, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id, step)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [sessionId, step]
    );
    return result.rows[0];
  }
  const cols = fields.map(quoteCol);
  const assignments = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');

  const result = await pool.query(
    `INSERT INTO onboarding_responses (session_id, step, ${cols.join(', ')}, updated_at)
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