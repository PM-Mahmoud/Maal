/**
 * Migration: scores_recommendations_accounts
 *
 * Creates:
 *   financial_scores  — score history per user (financial_health, super_health, ethical_score)
 *   recommendations   — personalised action items
 *   linked_accounts   — manually linked financial institutions
 */
module.exports = {
  name: 'scores_recommendations_accounts',
  up: async (client) => {
    // ── financial_scores ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_scores (
        id                    SERIAL PRIMARY KEY,
        user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score_type            VARCHAR(50) NOT NULL,
        score_value           INTEGER,
        grade                 VARCHAR(50),
        score_breakdown       JSONB DEFAULT '{}',
        diagnosis             TEXT,
        halal_compliance_score  INTEGER,
        portfolio_health_score  INTEGER,
        action_plan           JSONB DEFAULT '[]',
        calculated_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS financial_scores_user_id_idx ON financial_scores (user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS financial_scores_type_idx ON financial_scores (user_id, score_type)
    `);

    // ── recommendations ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendations (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category        VARCHAR(100) DEFAULT 'general',
        title           VARCHAR(500) NOT NULL,
        description     TEXT DEFAULT '',
        priority        VARCHAR(20) DEFAULT 'medium',
        impact          INTEGER DEFAULT 3,
        status          VARCHAR(20) DEFAULT 'pending',
        implemented_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS recommendations_user_id_idx ON recommendations (user_id)
    `);

    // ── linked_accounts ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS linked_accounts (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        institution_name    VARCHAR(255) NOT NULL,
        institution_type    VARCHAR(100),
        account_reference   VARCHAR(255),
        balance             NUMERIC DEFAULT 0,
        connection_status   VARCHAR(50) DEFAULT 'active',
        last_synced_at      TIMESTAMPTZ,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS linked_accounts_user_id_idx ON linked_accounts (user_id)
    `);
  },
};
