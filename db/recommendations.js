// db/recommendations.js
// Query functions for recommendations table.

const { pool } = require('./auth');

async function saveRecommendation(userId, rec) {
  const { category, title, description, priority, impact } = rec;
  const result = await pool.query(
    `INSERT INTO recommendations (user_id, category, title, description, priority, impact)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [userId, category||'general', title, description||'', priority||'medium', impact||3]
  );
  return result.rows[0];
}

async function saveRecommendationsBatch(userId, recs) {
  if (!recs.length) return [];
  const rows = [];
  for (const rec of recs) {
    const r = await saveRecommendation(userId, rec);
    rows.push(r);
  }
  return rows;
}

async function getRecommendationsByUserId(userId, status) {
  let query = `SELECT * FROM recommendations WHERE user_id = $1`;
  const params = [userId];
  if (status && status !== 'all') {
    query += ` AND status = $2`;
    params.push(status);
  }
  query += ` ORDER BY
    CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at DESC`;
  const result = await pool.query(query, params);
  return result.rows;
}

async function updateRecommendationStatus(recId, status) {
  const implementedAt = status === 'accepted' ? 'NOW()' : 'NULL';
  const result = await pool.query(
    `UPDATE recommendations
     SET status = $2, implemented_at = ${status === 'accepted' ? 'NOW()' : 'NULL'}
     WHERE id = $1
     RETURNING *`,
    [recId, status]
  );
  return result.rows[0] || null;
}

module.exports = { saveRecommendation, saveRecommendationsBatch, getRecommendationsByUserId, updateRecommendationStatus };