'use strict';

module.exports = {
  name: 'provider_connection_events',
  up: async (client) => {
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE import_runs ADD CONSTRAINT import_runs_id_user_unique UNIQUE (id, user_id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      CREATE TABLE IF NOT EXISTS provider_connection_events (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('connected','refreshed','sync_started','sync_succeeded','sync_failed','revoked')),
        scopes TEXT,
        import_run_id BIGINT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (import_run_id, user_id) REFERENCES import_runs(id, user_id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_provider_connection_events_user
        ON provider_connection_events(user_id, provider, occurred_at DESC);
    `);
  },
};
