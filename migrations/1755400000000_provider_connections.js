'use strict';

module.exports = {
  name: 'provider_connections',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS provider_connections (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_user_id TEXT,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        token_expires_at TIMESTAMPTZ,
        scopes TEXT,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_provider_connections_provider_user
        ON provider_connections(provider, provider_user_id)
        WHERE provider_user_id IS NOT NULL;
    `);
  },
};
