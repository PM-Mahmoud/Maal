// db/linked_accounts.js
// Query functions for linked_accounts table.

const { pool } = require('./auth');

async function addAccount(userId, { institution_name, institution_type, account_reference, balance }) {
  const result = await pool.query(
    `INSERT INTO linked_accounts (user_id, institution_name, institution_type, account_reference, balance)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [userId, institution_name, institution_type||null, account_reference||null, balance||0]
  );
  return result.rows[0];
}

async function getAccountsByUserId(userId) {
  const result = await pool.query(
    `SELECT * FROM linked_accounts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function updateAccountStatus(accountId, status) {
  const result = await pool.query(
    `UPDATE linked_accounts SET connection_status = $2, last_synced_at = NOW()
     WHERE id = $1 RETURNING *`,
    [accountId, status]
  );
  return result.rows[0] || null;
}

async function syncAccount(accountId, userId) {
  const result = await pool.query(
    `UPDATE linked_accounts SET last_synced_at = NOW(), connection_status = 'active'
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [accountId, userId]
  );
  return result.rows[0] || null;
}

async function deleteAccount(accountId, userId) {
  const result = await pool.query(
    `DELETE FROM linked_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [accountId, userId]
  );
  return result.rows[0] || null;
}

module.exports = { addAccount, getAccountsByUserId, updateAccountStatus, syncAccount, deleteAccount };