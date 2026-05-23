// db/users.js
// Query functions for users, verify tokens, and reset tokens.
// Pool comes from db/auth.js (singleton).

const { pool } = require('./auth');

// ─── Create ─────────────────────────────────────────────────────────────────

async function createUser({ email, name, passwordHash, provider, providerId }) {
  const result = await pool.query(
    `INSERT INTO users (email, name, password_hash, provider, provider_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, provider, email_verified, created_at`,
    [email, name, passwordHash || null, provider || 'credentials', providerId || null]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, email, name, password_hash, provider, provider_id,
            email_verified, verify_token, verify_token_exp, created_at
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, email, name, provider, email_verified, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findUserByProvider(provider, providerId) {
  const result = await pool.query(
    `SELECT id, email, name, provider, email_verified, created_at
     FROM users WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  );
  return result.rows[0] || null;
}

async function findUserByVerifyToken(token) {
  const result = await pool.query(
    `SELECT id, email, name, email_verified
     FROM users
     WHERE verify_token = $1 AND verify_token_exp > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

async function findUserByResetToken(token) {
  const result = await pool.query(
    `SELECT id, email
     FROM users
     WHERE reset_token = $1 AND reset_token_exp > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

// ─── Update ────────────────────────────────────────────────────────────────

async function setVerifyToken(userId, token, expiresAt) {
  await pool.query(
    `UPDATE users SET verify_token = $2, verify_token_exp = $3, updated_at = NOW()
     WHERE id = $1`,
    [userId, token, expiresAt]
  );
}

async function markEmailVerified(userId) {
  await pool.query(
    `UPDATE users SET email_verified = true, verify_token = NULL,
     verify_token_exp = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
}

async function setPasswordHash(userId, hash) {
  await pool.query(
    `UPDATE users SET password_hash = $2, reset_token = NULL,
     reset_token_exp = NULL, updated_at = NOW() WHERE id = $1`,
    [userId, hash]
  );
}

async function setResetToken(userId, token, expiresAt) {
  await pool.query(
    `UPDATE users SET reset_token = $2, reset_token_exp = $3, updated_at = NOW()
     WHERE id = $1`,
    [userId, token, expiresAt]
  );
}

async function updateName(userId, name) {
  await pool.query(
    `UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1`,
    [userId, name]
  );
}

async function deleteUser(userId) {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByProvider,
  findUserByVerifyToken,
  findUserByResetToken,
  setVerifyToken,
  markEmailVerified,
  setPasswordHash,
  setResetToken,
  updateName,
  deleteUser,
};