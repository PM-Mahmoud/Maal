// db/widgets.js — dashboard widgets a user saved from Ask Maal.
// All queries scoped by user_id (IDOR rule). Stores the widget SPEC (source +
// title); live data is recomputed from the source on read.

const { pool } = require('./auth');
const { isKnownSource } = require('../services/advisor-widgets');

async function listWidgets(userId) {
  const r = await pool.query(
    `SELECT id, source, title, created_at FROM user_widgets WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

// Save a widget. Rejects unknown sources (the whitelist is authoritative) and
// de-dupes the same source per user so the dashboard can't fill with copies.
async function addWidget(userId, source, title) {
  if (!isKnownSource(source)) return null;
  const existing = await pool.query(`SELECT id FROM user_widgets WHERE user_id = $1 AND source = $2`, [userId, source]);
  if (existing.rows.length) return existing.rows[0].id;
  const r = await pool.query(
    `INSERT INTO user_widgets (user_id, source, title) VALUES ($1, $2, $3) RETURNING id`,
    [userId, source, (title || '').slice(0, 80) || null]
  );
  return r.rows[0].id;
}

async function removeWidget(id, userId) {
  await pool.query(`DELETE FROM user_widgets WHERE id = $1 AND user_id = $2`, [id, userId]);
}

module.exports = { listWidgets, addWidget, removeWidget };
