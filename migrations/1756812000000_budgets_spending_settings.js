/**
 * Migration: budgets_spending_settings
 *
 * Storage for the Spending settings flows (Figma, 2026-11):
 *  budgets            — monthly AUD budgets. category_group NULL = the overall
 *                       monthly budget; otherwise one of the 18 AU taxonomy
 *                       groups (lib/transaction-categories.js). One row per
 *                       (user, group) — enforced by a unique expression index.
 *  spending_settings  — one JSONB row per user: include_upcoming (count future
 *                       bills/recurring payments in the budget) and
 *                       excluded_groups (categories not counted as spending).
 *
 * HUMAN REVIEW REQUIRED before applying to production: purely additive (two new
 * tables) but both FK-reference the protected `users` table. Nothing ALTERs
 * users / linked_accounts / transactions / session.
 */
module.exports = {
  name: 'budgets_spending_settings',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id             BIGSERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_group TEXT,
        monthly_amount NUMERIC(14,2) NOT NULL CHECK (monthly_amount > 0),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_user_group ON budgets(user_id, COALESCE(category_group, ''));

      CREATE TABLE IF NOT EXISTS spending_settings (
        user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  },
};
