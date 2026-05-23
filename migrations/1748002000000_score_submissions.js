/**
 * Migration: score_submissions
 *
 * Creates score_submissions table — anonymous Financial Health Score calculator
 * submissions from /score (public, no auth required).
 * Used for analytics only; not linked to authenticated users.
 */
module.exports = {
  name: 'score_submissions',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS score_submissions (
        id              SERIAL PRIMARY KEY,
        profession      VARCHAR(255),
        stage           VARCHAR(100),
        age             INTEGER,
        annual_income   NUMERIC,
        score           INTEGER,
        grade           VARCHAR(50),
        components      JSONB DEFAULT '{}',
        recommendations JSONB DEFAULT '[]',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS score_submissions_created_at_idx
        ON score_submissions (created_at DESC)
    `);
  },
};
