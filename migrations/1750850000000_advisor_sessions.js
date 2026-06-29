module.exports = {
  name: 'advisor_sessions',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS advisor_sessions (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_advisor_sessions_user ON advisor_sessions(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS advisor_messages (
        id          BIGSERIAL PRIMARY KEY,
        session_id  BIGINT NOT NULL REFERENCES advisor_sessions(id) ON DELETE CASCADE,
        role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content     TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_advisor_messages_session ON advisor_messages(session_id, created_at ASC);
    `);
  },
};
