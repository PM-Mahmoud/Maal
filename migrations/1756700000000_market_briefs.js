/**
 * Migration: market_briefs
 *
 * Daily market brief cache (Home → "Daily market brief" story). One row per
 * Sydney calendar day holding the generated brief + the index/AUD figures it
 * was built from, so the model runs at most once a day for everyone and the
 * index sparklines can be built from real daily closes over time.
 *
 * Additive only: a new table with no foreign keys. Not per-user — market
 * content is the same for every member and contains no PII.
 */
module.exports = {
  name: 'market_briefs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS market_briefs (
        brief_date   DATE PRIMARY KEY,
        payload      JSONB NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  },
};
