// db/goals.js — persisted savings/investment goals.

const { pool } = require('./auth');

async function listGoals(userId) {
  const r = await pool.query(
    `SELECT id, name, type, target, current, created_at
       FROM goals WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function createGoal(userId, { name, type, target, current }) {
  const r = await pool.query(
    `INSERT INTO goals (user_id, name, type, target, current)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, name, type || 'Save', Math.max(0, Number(target) || 0), Math.max(0, Number(current) || 0)]
  );
  return r.rows[0].id;
}

async function updateGoalProgress(id, userId, current) {
  await pool.query(
    `UPDATE goals SET current = $3 WHERE id = $1 AND user_id = $2`,
    [id, userId, Math.max(0, Number(current) || 0)]
  );
}

async function deleteGoal(id, userId) {
  await pool.query(`DELETE FROM goals WHERE id = $1 AND user_id = $2`, [id, userId]);
}

module.exports = { listGoals, createGoal, updateGoalProgress, deleteGoal };
