/**
 * Migration: spending_custom_categories
 *
 * Session 2 "Breakdown & budget" (HEL-89, HEL-90):
 *  spending_custom_categories     — user-made categories that sit beside the
 *                                   18 built-in AU groups (lib/transaction-categories.js).
 *                                   A transaction is put in one by storing its
 *                                   name as transaction_categories.category_group
 *                                   (side table, FK to transactions), and a budget
 *                                   by storing it as budgets.category_group.
 *  spending_category_groups       — user-made groups that collect categories
 *                                   (built-in or custom) for the breakdown's
 *                                   "View by group".
 *  spending_category_group_members — which categories sit in which group. A
 *                                   category is in at most one group per user.
 *
 * HUMAN REVIEW REQUIRED before applying to production: purely additive (three
 * new tables) but each FK-references the protected `users` table. Nothing
 * ALTERs users / linked_accounts / transactions / session.
 */
module.exports = {
  name: 'spending_custom_categories',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS spending_custom_categories (
        id         BIGSERIAL PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
        kind       TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income')),
        color      TEXT NOT NULL,
        icon       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_spending_custom_categories_name
        ON spending_custom_categories(user_id, lower(name));

      CREATE TABLE IF NOT EXISTS spending_category_groups (
        id         BIGSERIAL PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
        kind       TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income')),
        color      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_spending_category_groups_name
        ON spending_category_groups(user_id, lower(name));

      CREATE TABLE IF NOT EXISTS spending_category_group_members (
        group_id      BIGINT NOT NULL REFERENCES spending_category_groups(id) ON DELETE CASCADE,
        user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_name TEXT NOT NULL,
        PRIMARY KEY (group_id, category_name)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_spending_group_members_user_cat
        ON spending_category_group_members(user_id, category_name);
    `);
  },
};
