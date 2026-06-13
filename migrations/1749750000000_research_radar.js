// Real Research reports + Radar watches (replacing the localStorage demos).
module.exports = {
  name: 'research_radar',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS research_reports (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        report TEXT,
        sources JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS research_user_created_idx
        ON research_reports (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS radars (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        symbols TEXT[] DEFAULT '{}',
        frequency TEXT NOT NULL DEFAULT 'daily',
        notify_email BOOLEAN DEFAULT true,
        notify_sms BOOLEAN DEFAULT false,
        active BOOLEAN DEFAULT true,
        last_run_at TIMESTAMPTZ,
        last_result TEXT,
        last_alerted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS radars_user_idx ON radars (user_id);

      CREATE TABLE IF NOT EXISTS radar_events (
        id BIGSERIAL PRIMARY KEY,
        radar_id BIGINT NOT NULL REFERENCES radars(id) ON DELETE CASCADE,
        alerted BOOLEAN DEFAULT false,
        summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS radar_events_radar_idx ON radar_events (radar_id, created_at DESC);
    `);
  },
};
