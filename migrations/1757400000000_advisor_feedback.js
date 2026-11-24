module.exports = {
  name: 'advisor_feedback',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS advisor_message_feedback (
        message_id BIGINT NOT NULL REFERENCES advisor_messages(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        note TEXT CHECK (char_length(note) <= 1000),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_advisor_message_feedback_user
        ON advisor_message_feedback (user_id);
    `);
  },
};
