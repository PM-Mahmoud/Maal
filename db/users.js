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
            email_verified, verify_token, verify_token_exp, created_at,
            locked_until, two_factor_enabled
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, email, name, provider, email_verified, created_at,
            plan, basiq_user_id, phone, two_factor_enabled, notification_prefs
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

// TODO: verify unused — OTP flow replaced verify_token; this is retained for potential link-based fallback
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

// TODO: verify unused — see findUserByVerifyToken note above
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
// ─── OTP ────────────────────────────────────────────────────────────────────

async function setOtp(userId, code, expiresAt) {
  await pool.query(
    `UPDATE users SET otp_code = $2, otp_expires_at = $3, updated_at = NOW() WHERE id = $1`,
    [userId, code, expiresAt]
  );
}

async function findUserByOtp(email, code) {
  const result = await pool.query(
    `SELECT id, email, name, email_verified
     FROM users
     WHERE email = $1 AND otp_code = $2 AND otp_expires_at > NOW()`,
    [email, code]
  );
  return result.rows[0] || null;
}

async function clearOtp(userId) {
  await pool.query(
    `UPDATE users SET otp_code = NULL, otp_expires_at = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
}

// ─── Lockout ────────────────────────────────────────────────────────────────

async function incrementFailedAttempts(userId) {
  const result = await pool.query(
    `UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = NOW()
     WHERE id = $1 RETURNING failed_attempts`,
    [userId]
  );
  return result.rows[0]?.failed_attempts || 0;
}

async function lockUser(userId, until) {
  await pool.query(
    `UPDATE users SET locked_until = $2, updated_at = NOW() WHERE id = $1`,
    [userId, until]
  );
}

async function resetFailedAttempts(userId) {
  await pool.query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
}

async function recordLogin(userId, ip) {
  await pool.query(
    `UPDATE users SET last_login_at = NOW(), last_login_ip = $2, updated_at = NOW() WHERE id = $1`,
    [userId, ip]
  );
}

// ─── Admin ───────────────────────────────────────────────────────────────────

async function getAllUsers() {
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.provider, u.email_verified,
            u.failed_attempts, u.locked_until,
            u.last_login_at, u.last_login_ip, u.created_at,
            p.completed_onboarding, p.profession
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

module.exports = {
  ...module.exports,
  setOtp, findUserByOtp, clearOtp,
  incrementFailedAttempts, lockUser, resetFailedAttempts, recordLogin,
  getAllUsers,
};

// ─── Phone ───────────────────────────────────────────────────────────────────

async function setPhone(userId, phone) {
  await pool.query(
    `UPDATE users SET phone = $2, updated_at = NOW() WHERE id = $1`,
    [userId, phone]
  );
}

module.exports = {
  ...module.exports,
  setPhone,
};

// ─── Subscription plan + Basiq linkage ───────────────────────────────────────

async function setUserPlan(userId, plan) {
  await pool.query(`UPDATE users SET plan = $2 WHERE id = $1`, [userId, plan]);
}

async function setBasiqUserId(userId, basiqUserId) {
  await pool.query(`UPDATE users SET basiq_user_id = $2 WHERE id = $1`, [userId, basiqUserId]);
}

async function setTwoFactor(userId, enabled) {
  await pool.query(`UPDATE users SET two_factor_enabled = $2 WHERE id = $1`, [userId, !!enabled]);
}

// Merge a single key into the user's notification_prefs JSONB.
async function setNotificationPref(userId, key, value) {
  await pool.query(
    `UPDATE users
        SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || jsonb_build_object($2::text, $3::boolean)
      WHERE id = $1`,
    [userId, key, !!value]
  );
}


// ─── OTP Brute-Force Protection ───────────────────────────────────────────────

async function incrementOtpAttempts(userId) {
  const { rows } = await pool.query(
    `UPDATE users SET otp_attempts = otp_attempts + 1,
       otp_locked_until = CASE WHEN otp_attempts + 1 >= 5
         THEN NOW() + INTERVAL '15 minutes' ELSE otp_locked_until END
     WHERE id = $1 RETURNING otp_attempts, otp_locked_until`,
    [userId]
  );
  return rows[0];
}

async function resetOtpAttempts(userId) {
  await pool.query(
    `UPDATE users SET otp_attempts = 0, otp_locked_until = NULL WHERE id = $1`,
    [userId]
  );
}

async function getOtpLockStatus(userId) {
  const { rows } = await pool.query(
    `SELECT otp_attempts, otp_locked_until FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

// ─── Channels (PR 10) ─────────────────────────────────────────────────────────

// Match an inbound SMS sender to a registered user by phone. Normalises to the
// digits (+ optional leading +) so '+61 400 000 000' and '0400000000' variants
// can still match if stored consistently. Returns the full user row or null.
async function findUserByPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const { rows } = await pool.query(
    `SELECT id, email, name, plan, phone, notification_prefs
       FROM users
      WHERE phone = $1 OR regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') = $2
      LIMIT 1`,
    [raw, digits]
  );
  return rows[0] || null;
}

// Users who opted into the daily portfolio digest (notification_prefs.daily_digest = true).
async function usersWithDigestOptIn() {
  const { rows } = await pool.query(
    `SELECT id, email, name FROM users
      WHERE COALESCE(notification_prefs->>'daily_digest','false') = 'true'
        AND email IS NOT NULL`
  );
  return rows;
}

module.exports = {
  ...module.exports,
  setUserPlan,
  setBasiqUserId,
  setTwoFactor,
  setNotificationPref,
  incrementOtpAttempts,
  resetOtpAttempts,
  getOtpLockStatus,
  findUserByPhone,
  usersWithDigestOptIn,
};
