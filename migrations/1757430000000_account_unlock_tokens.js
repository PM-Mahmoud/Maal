'use strict';

exports.up = async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS account_unlock_tokens (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
};
