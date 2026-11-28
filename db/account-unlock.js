'use strict';

const pool = require('./pool');

// Claim the lock and its token together. Requests that reach the database
// after another request acquires the lock never issue another email.
async function recordPasswordFailure(userId, passwordHash, { maxAttempts, expiresAt, tokenHash }) {
  const { rows } = await pool.query(
    `WITH failure AS (
       UPDATE users
       SET failed_attempts = CASE WHEN locked_until IS NULL THEN failed_attempts + 1 ELSE 1 END,
           locked_until = CASE
             WHEN locked_until IS NULL AND failed_attempts + 1 >= $3 THEN $4::timestamptz
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE id = $1 AND password_hash = $2
         AND (locked_until IS NULL OR locked_until <= NOW())
       RETURNING id, locked_until
     )
     INSERT INTO account_unlock_tokens (user_id, token_hash, expires_at)
     SELECT id, $5, locked_until FROM failure WHERE locked_until IS NOT NULL
     ON CONFLICT (user_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
     RETURNING user_id`,
    [userId, passwordHash, maxAttempts, expiresAt, tokenHash],
  );
  return rows.length === 1;
}

// The token selects its own account. Burning it and clearing that exact lock
// take place in one statement. A stale link cannot clear a later lock.
async function consumeAccountUnlock(tokenHash) {
  const { rows } = await pool.query(
    `WITH consumed AS (
       DELETE FROM account_unlock_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       RETURNING user_id, expires_at
     )
     UPDATE users AS account
     SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
     FROM consumed
     WHERE account.id = consumed.user_id AND account.locked_until = consumed.expires_at
     RETURNING account.id`,
    [tokenHash],
  );
  return rows.length === 1;
}

module.exports = { recordPasswordFailure, consumeAccountUnlock };
