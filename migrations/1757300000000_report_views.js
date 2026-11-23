/**
 * Migration: report_views
 *
 * Saved views for Spending → Reports (/app/spending/reports, HEL-107).
 * One row per saved report: a user-chosen name plus a validated JSON config
 * (tab, chart type, grouping, date range, filters — see lib/report-views.js).
 *
 * HUMAN REVIEW REQUIRED before applying to production: purely additive (one new
 * table) but it FK-references the protected `users` table. Nothing ALTERs
 * users / linked_accounts / transactions / session.
 */
module.exports = {
  name: 'report_views',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_views (
        id         BIGSERIAL PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
        config     JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_report_views_user ON report_views(user_id, created_at);
    `);
  },
};
