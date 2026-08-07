module.exports = {
  name: 'recommendation_actions',
  up: async (client) => client.query(`
    ALTER TABLE recommendations
      ADD COLUMN IF NOT EXISTS source_key TEXT,
      ADD COLUMN IF NOT EXISTS impact_score SMALLINT CHECK (impact_score BETWEEN 1 AND 5),
      ADD COLUMN IF NOT EXISTS urgency_score SMALLINT CHECK (urgency_score BETWEEN 1 AND 5),
      ADD COLUMN IF NOT EXISTS confidence_score SMALLINT CHECK (confidence_score BETWEEN 1 AND 5),
      ADD COLUMN IF NOT EXISTS effort_score SMALLINT CHECK (effort_score BETWEEN 1 AND 5),
      ADD COLUMN IF NOT EXISTS rank_score NUMERIC(5,1),
      ADD COLUMN IF NOT EXISTS ranking JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS target JSONB,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS recommendations_user_source_idx ON recommendations(user_id,source_key) WHERE source_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS recommendation_events (
      id BIGSERIAL PRIMARY KEY, recommendation_id INTEGER NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, from_status TEXT NOT NULL, to_status TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS recommendation_events_user_idx ON recommendation_events(user_id,occurred_at DESC);
    CREATE TABLE IF NOT EXISTS recommendation_outcomes (
      id BIGSERIAL PRIMARY KEY, recommendation_id INTEGER NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, metric TEXT NOT NULL, value NUMERIC,
      unit TEXT, baseline_value NUMERIC, delta NUMERIC, measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), note TEXT
    );
    CREATE INDEX IF NOT EXISTS recommendation_outcomes_user_idx ON recommendation_outcomes(user_id,measured_at DESC);
  `),
};
