'use strict';

module.exports = {
  name: 'build9_extensibility',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_rule_runs (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rule_id BIGINT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL, event_type TEXT NOT NULL, event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL CHECK(status IN ('triggered','failed')), error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(rule_id,event_id)
      );
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL, event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0), response_status INTEGER, response_body TEXT,
        delivered_at TIMESTAMPTZ, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(webhook_id,event_id)
      );
      CREATE INDEX IF NOT EXISTS automation_rule_runs_user_created ON automation_rule_runs(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS webhook_deliveries_user_created ON webhook_deliveries(user_id,created_at DESC);

      CREATE OR REPLACE FUNCTION reject_activity_ledger_mutation() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'activity ledger is append-only'; END; $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS activity_ledger_immutable ON activity_ledger;
      CREATE TRIGGER activity_ledger_immutable BEFORE UPDATE OR DELETE ON activity_ledger
        FOR EACH ROW EXECUTE FUNCTION reject_activity_ledger_mutation();
    `);
  },
};
