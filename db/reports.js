'use strict';
// db/reports.js — Spending Reports (HEL-106/HEL-107): saved report views
// (migration 1757300000000) and the date-ranged transactions read behind
// GET /api/v1/reports/transactions. Every statement filters by user_id in SQL
// (no RLS here — a missing user filter would be an IDOR bug).

const pool = require('./pool');

const VIEW_COLS = 'id, name, config, created_at, updated_at';

async function listViews(userId) {
  const r = await pool.query(
    `SELECT ${VIEW_COLS} FROM report_views WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
    [userId]
  );
  return r.rows;
}

async function countViews(userId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM report_views WHERE user_id = $1`, [userId]);
  return r.rows[0] ? r.rows[0].n : 0;
}

async function createView(userId, { name, config }) {
  const r = await pool.query(
    `INSERT INTO report_views (user_id, name, config) VALUES ($1, $2, $3::jsonb) RETURNING ${VIEW_COLS}`,
    [userId, name, JSON.stringify(config)]
  );
  return r.rows[0];
}

/** Update name and/or config; null when the view isn't the user's (or doesn't exist). */
async function updateView(id, userId, patch) {
  const r = await pool.query(
    `UPDATE report_views
        SET name = COALESCE($3, name),
            config = COALESCE($4::jsonb, config),
            updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING ${VIEW_COLS}`,
    [id, userId, patch.name === undefined ? null : patch.name,
      patch.config === undefined ? null : JSON.stringify(patch.config)]
  );
  return r.rows[0] || null;
}

/** Delete one view; false when it isn't the user's (or doesn't exist). */
async function deleteView(id, userId) {
  const r = await pool.query(`DELETE FROM report_views WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount > 0;
}

/**
 * Transactions dated within [from, to] (inclusive "YYYY-MM-DD"), oldest first,
 * read in keyset pages of `pageSize` so long ranges come back complete rather
 * than cut at the latest 500 like GET /v1/transactions. Stops at `maxRows` and
 * reports `truncated` so the client can say the report is partial.
 * Same columns as db/transactions.getTransactionsWithCategory, except
 * post_date is returned as "YYYY-MM-DD" text (no timezone shift).
 */
async function getTransactionsInRange(userId, from, to, { pageSize = 1000, maxRows = 20000 } = {}) {
  const rows = [];
  let after = null; // [post_date text, id] of the last row read
  for (;;) {
    const limit = Math.min(pageSize, maxRows - rows.length + 1);
    const params = [userId, from, to, limit];
    let keyset = '';
    if (after) {
      params.push(after[0], after[1]);
      keyset = 'AND (t.post_date, t.id) > ($5::date, $6::bigint)';
    }
    const r = await pool.query(
      `SELECT t.id, t.description, t.amount, t.status, to_char(t.post_date, 'YYYY-MM-DD') AS post_date,
              pd.account_reference, c.category_group, c.category, c.source AS category_source
         FROM transactions t
         LEFT JOIN transaction_provider_details pd ON pd.transaction_id = t.id
         LEFT JOIN transaction_categories c ON c.transaction_id = t.id
        WHERE t.user_id = $1
          AND t.post_date >= $2::date AND t.post_date <= $3::date
          ${keyset}
        ORDER BY t.post_date ASC, t.id ASC
        LIMIT $4`,
      params
    );
    rows.push(...r.rows);
    if (rows.length > maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
    if (r.rows.length < limit) return { rows, truncated: false };
    const last = r.rows[r.rows.length - 1];
    after = [last.post_date, last.id];
  }
}

module.exports = { listViews, countViews, createView, updateView, deleteView, getTransactionsInRange };
