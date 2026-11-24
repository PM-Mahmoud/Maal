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

async function updateSessionStep(sessionId, userId, step) {
  await pool.query(
    `UPDATE onboarding_sessions
     SET current_step = $2, last_active_at = NOW()
     WHERE id = $1 AND user_id = $3`,
    [sessionId, step, userId]
  );
}

async function completeSession(sessionId, userId) {
  const result = await pool.query(
    `UPDATE onboarding_sessions
     SET is_complete = true, last_active_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return result.rowCount > 0;
}

// ─── Responses ─────────────────────────────────────────────────────────────────

// Whitelist of column names that upsertResponse may write to. Column names are
// interpolated into SQL (they cannot be parameterised), so any key not in this
// set is silently dropped to prevent SQL injection via crafted form fields.
// Keep in sync with migrations/1747996000000_onboarding.js (onboarding_responses).
const RESPONSE_COLUMNS = new Set([
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

async function upsertResponse(sessionId, userId, step, data) {
  const fields = Object.keys(data).filter((field) => RESPONSE_COLUMNS.has(field));
  const columns = fields.map(quoteCol);
  const values = fields.map((field) => data[field]);
  const insertColumns = ['session_id', 'step', 'user_id', ...columns, 'updated_at'];
  const insertValues = ['s.id', '$2', '$3', ...values.map((_, i) => `$${i + 4}`), 'NOW()'];
  const assignments = ['user_id', ...columns].map((column) => `${column} = EXCLUDED.${column}`);

  const result = await pool.query(
    `INSERT INTO onboarding_responses (${insertColumns.join(', ')})
     SELECT ${insertValues.join(', ')}
     FROM onboarding_sessions s
     WHERE s.id = $1 AND s.user_id = $3
     ON CONFLICT (session_id, step)
     DO UPDATE SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE onboarding_responses.user_id IS NULL OR onboarding_responses.user_id = EXCLUDED.user_id
     RETURNING id`,
    [sessionId, step, userId, ...values]
  );
  return result.rows[0] || null;
}

async function getResponsesBySession(sessionId, userId) {
  const result = await pool.query(
    `SELECT r.* FROM onboarding_responses r
     JOIN onboarding_sessions s ON r.session_id = s.id
     WHERE s.id = $1 AND s.user_id = $2
       AND (r.user_id IS NULL OR r.user_id = s.user_id)
     ORDER BY r.step ASC`,
    [sessionId, userId]
  );
  return result.rows;
}

async function getFullProfileByUserId(userId) {
  const result = await pool.query(
    `SELECT r.* FROM onboarding_responses r
     JOIN onboarding_sessions s ON r.session_id = s.id
     WHERE s.user_id = $1 AND r.is_complete = true
       AND (r.user_id IS NULL OR r.user_id = s.user_id)
     ORDER BY r.step ASC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getResponseByStep(sessionId, userId, step) {
  const result = await pool.query(
    `SELECT r.* FROM onboarding_responses r
     JOIN onboarding_sessions s ON r.session_id = s.id
     WHERE s.id = $1 AND r.step = $2 AND s.user_id = $3
       AND (r.user_id IS NULL OR r.user_id = s.user_id)`,
    [sessionId, step, userId]
  );
  return result.rows[0] || null;
}

async function markResponseComplete(sessionId, userId) {
  await pool.query(
    `UPDATE onboarding_responses r
     SET is_complete = true, completed_at = NOW()
     FROM onboarding_sessions s
     WHERE r.session_id = s.id AND s.id = $1 AND s.user_id = $2
       AND (r.user_id IS NULL OR r.user_id = s.user_id)`,
    [sessionId, userId]
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
