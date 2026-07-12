module.exports = {
  name: 'advisor_memory',
  up: async (client) => {
    // One synthesized memory document per user (markdown), inferred from their
    // conversations by the cheap model. Distinct from custom instructions
    // (which the user authors, stored in user_profiles.onboarding_data).
    // Additive table; only FK-references users(id). last_merged_at drives the
    // deferred-merge debounce.
    await client.query(`
      CREATE TABLE IF NOT EXISTS advisor_memory (
        user_id        BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        content        TEXT NOT NULL DEFAULT '',
        last_merged_at TIMESTAMPTZ,
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  },
};
