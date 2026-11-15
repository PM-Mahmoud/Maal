'use strict';
// db/budgets.js — monthly budgets + spending settings (migration
// 1756800000000). Every statement filters by user_id in SQL (no RLS here —
// a missing user filter would be an IDOR bug).

const pool = require('./pool');

async function listBudgets(userId) {
  const r = await pool.query(
    `SELECT id, category_group, monthly_amount, updated_at
       FROM budgets WHERE user_id = $1
      ORDER BY category_group NULLS FIRST, id ASC`,
    [userId]
  );
  return r.rows;
}

/** Insert or update the user's budget for one group (null = overall). */
async function upsertBudget(userId, { category_group, monthly_amount }) {
  const r = await pool.query(
    `INSERT INTO budgets (user_id, category_group, monthly_amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, COALESCE(category_group, ''))
     DO UPDATE SET monthly_amount = EXCLUDED.monthly_amount, updated_at = NOW()
     RETURNING id, category_group, monthly_amount, updated_at`,
    [userId, category_group, monthly_amount]
  );
  return r.rows[0];
}

/** Delete one budget row; false when it isn't the user's (or doesn't exist). */
async function deleteBudget(id, userId) {
  const r = await pool.query(`DELETE FROM budgets WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount > 0;
}

/** "Reset budget": remove every budget row for the user. Transactions untouched. */
async function deleteAllBudgets(userId) {
  const r = await pool.query(`DELETE FROM budgets WHERE user_id = $1`, [userId]);
  return r.rowCount;
}

async function getSettings(userId) {
  const r = await pool.query(`SELECT settings FROM spending_settings WHERE user_id = $1`, [userId]);
  return r.rows[0] ? r.rows[0].settings : null;
}

/** Merge a validated patch into the stored settings (JSONB ||). */
async function updateSettings(userId, patch) {
  const r = await pool.query(
    `INSERT INTO spending_settings (user_id, settings) VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET settings = spending_settings.settings || EXCLUDED.settings, updated_at = NOW()
     WHERE spending_settings.user_id = $1
     RETURNING settings`,
    [userId, JSON.stringify(patch)]
  );
  return r.rows[0] ? r.rows[0].settings : patch;
}

module.exports = { listBudgets, upsertBudget, deleteBudget, deleteAllBudgets, getSettings, updateSettings };
