'use strict';

const pool = require('./pool');
const { encryptToken, decryptToken } = require('../services/provider-token-crypto');

async function upsertConnection(userId, provider, tokens) {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : null;
  const { rows } = await pool.query(
    `INSERT INTO provider_connections
       (user_id, provider, provider_user_id, access_token_encrypted,
        refresh_token_encrypted, token_expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_user_id = COALESCE(EXCLUDED.provider_user_id, provider_connections.provider_user_id),
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, provider_connections.refresh_token_encrypted),
       token_expires_at = EXCLUDED.token_expires_at,
       scopes = COALESCE(EXCLUDED.scopes, provider_connections.scopes),
       updated_at = NOW()
     RETURNING id, user_id, provider, provider_user_id, token_expires_at,
               scopes, connected_at, updated_at`,
    [
      userId,
      provider,
      tokens.user_id || tokens.provider_user_id || null,
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
      expiresAt,
      tokens.scope || null,
    ]
  );
  return rows[0];
}

async function getConnection(userId, provider) {
  const { rows } = await pool.query(
    `SELECT * FROM provider_connections WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    access_token: decryptToken(row.access_token_encrypted),
    refresh_token: decryptToken(row.refresh_token_encrypted),
  };
}

async function deleteConnection(userId, provider) {
  const { rows } = await pool.query(
    `DELETE FROM provider_connections WHERE user_id = $1 AND provider = $2 RETURNING id`,
    [userId, provider]
  );
  return rows[0] || null;
}

module.exports = { upsertConnection, getConnection, deleteConnection };
