'use strict';
// db/recurring-items.js — manual recurring items + decisions on detected
// recurring rows (migration 1757210000000, Spending › Recurring). Every
// statement filters by user_id in SQL (no RLS here — a missing user filter
// would be an IDOR bug).

const pool = require('./pool');

const COLS = 'id, status, name, amount, frequency, kind, next_date::text AS next_date, category_group, source_key, transaction_id, created_at, updated_at';

async function listRecurringItems(userId) {
  const r = await pool.query(
    `SELECT ${COLS} FROM recurring_items WHERE user_id = $1 ORDER BY id ASC`,
    [userId]
  );
  return r.rows;
}

/**
 * Create a manual item. With a source_key (editing a detected row) it
 * upserts over any earlier decision for that key.
 */
async function createRecurringItem(userId, item) {
  const vals = [userId, item.name, item.amount, item.frequency, item.kind, item.next_date,
    item.category_group ?? null, item.source_key ?? null, item.transaction_id ?? null];
  const insert = `INSERT INTO recurring_items (user_id, status, name, amount, frequency, kind, next_date, category_group, source_key, transaction_id)
       VALUES ($1, 'active', $2, $3, $4, $5, $6, $7, $8, $9)`;
  const sql = item.source_key
    ? `${insert}
       ON CONFLICT (user_id, source_key) WHERE source_key IS NOT NULL
       DO UPDATE SET status = 'active', name = EXCLUDED.name, amount = EXCLUDED.amount, frequency = EXCLUDED.frequency,
         kind = EXCLUDED.kind, next_date = EXCLUDED.next_date, category_group = EXCLUDED.category_group,
         transaction_id = EXCLUDED.transaction_id, updated_at = NOW()
       RETURNING ${COLS}`
    : `${insert} RETURNING ${COLS}`;
  const r = await pool.query(sql, vals);
  return r.rows[0];
}

const UPDATABLE = ['name', 'amount', 'frequency', 'kind', 'next_date', 'category_group'];

/** Patch an active manual item the user owns. Returns the row or null. */
async function updateRecurringItem(userId, id, patch) {
  const sets = [];
  const vals = [userId, id];
  for (const k of UPDATABLE) {
    if (patch[k] === undefined) continue;
    vals.push(patch[k]);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return null;
  const r = await pool.query(
    `UPDATE recurring_items SET ${sets.join(', ')}, updated_at = NOW()
      WHERE user_id = $1 AND id = $2 AND status = 'active'
      RETURNING ${COLS}`,
    vals
  );
  return r.rows[0] || null;
}

/** Remove one of the user's rows (a manual item or a decision). */
async function deleteRecurringItem(userId, id) {
  const r = await pool.query('DELETE FROM recurring_items WHERE user_id = $1 AND id = $2', [userId, id]);
  return r.rowCount > 0;
}

/** Record dismiss / confirm for a detected row (replaces any earlier row for that key). */
async function setDetectedDecision(userId, sourceKey, status) {
  const r = await pool.query(
    `INSERT INTO recurring_items (user_id, status, source_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, source_key) WHERE source_key IS NOT NULL
     DO UPDATE SET status = EXCLUDED.status, name = NULL, amount = NULL, frequency = NULL, kind = NULL,
       next_date = NULL, category_group = NULL, transaction_id = NULL, updated_at = NOW()
     RETURNING ${COLS}`,
    [userId, status, sourceKey]
  );
  return r.rows[0];
}

/** Undo a decision or edit for a detected row so the detected row shows again. */
async function clearDetectedDecision(userId, sourceKey) {
  const r = await pool.query('DELETE FROM recurring_items WHERE user_id = $1 AND source_key = $2', [userId, sourceKey]);
  return r.rowCount > 0;
}

module.exports = {
  listRecurringItems, createRecurringItem, updateRecurringItem, deleteRecurringItem,
  setDetectedDecision, clearDetectedDecision,
};
