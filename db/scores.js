// db/scores.js
// Query functions for financial_scores table.

const { pool } = require('./auth');

async function saveScore(userId, { score_type, score_value, grade, score_breakdown,
  diagnosis, halal_compliance_score, portfolio_health_score, action_plan }) {
  const result = await pool.query(
    `INSERT INTO financial_scores
     (user_id, score_type, score_value, grade, score_breakdown, diagnosis,
      halal_compliance_score, portfolio_health_score, action_plan, calculated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     RETURNING *`,
    [userId, score_type, score_value, grade,
     JSON.stringify(score_breakdown||{}), diagnosis||'',
     halal_compliance_score||null, portfolio_health_score||null,
     JSON.stringify(action_plan||[])]
  );
  return result.rows[0];
}

async function getScoresByUserId(userId, limit = 10) {
  const result = await pool.query(
    `SELECT * FROM financial_scores
     WHERE user_id = $1
     ORDER BY calculated_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function getLatestScoreByUserId(userId, scoreType) {
  const result = await pool.query(
    `SELECT * FROM financial_scores
     WHERE user_id = $1 AND score_type = $2
     ORDER BY calculated_at DESC
     LIMIT 1`,
    [userId, scoreType]
  );
  return result.rows[0] || null;
}

// Pure: reduce financial_scores rows to the Maal Score history series, oldest
// first, for charting. Kept pure (no DB) so it's deterministically testable.
function shapeScoreHistory(rows, scoreType = 'maal_score') {
  return (rows || [])
    .filter((r) => r && r.score_type === scoreType && r.score_value != null)
    .map((r) => ({ value: Number(r.score_value), at: r.calculated_at }))
    .filter((p) => Number.isFinite(p.value))
    .reverse();
}

module.exports = { saveScore, getScoresByUserId, getLatestScoreByUserId, shapeScoreHistory };