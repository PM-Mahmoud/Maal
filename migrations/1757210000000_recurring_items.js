/**
 * Migration: recurring_items
 *
 * Spending › Recurring (redesign session 2, HEL-104/105). One user-scoped
 * table holds both:
 *  - manual recurring items the user adds (status 'active': name, amount,
 *    frequency, next_date, kind bill/subscription/income, category_group);
 *    when source_key is set the item replaces the auto-detected recurring
 *    row with that merchant_key (an edit of a detected item);
 *  - decisions about auto-detected rows (status 'dismissed' | 'confirmed',
 *    keyed by source_key = detectRecurringTransactions().merchant_key).
 * One row per (user, source_key) when source_key is set.
 *
 * HUMAN REVIEW REQUIRED before applying to production: purely additive (one
 * new table) but it FK-references the protected `users` table. Nothing ALTERs
 * users / linked_accounts / transactions / session. transaction_id is a plain
 * reference (no FK) so it never constrains the protected transactions table.
 */
module.exports = {
  name: 'recurring_items',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS recurring_items (
        id             BIGSERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'confirmed')),
        name           TEXT,
        amount         NUMERIC(14,2) CHECK (amount IS NULL OR amount > 0),
        frequency      TEXT CHECK (frequency IS NULL OR frequency IN ('weekly', 'fortnightly', 'monthly', 'yearly')),
        kind           TEXT CHECK (kind IS NULL OR kind IN ('bill', 'subscription', 'income')),
        next_date      DATE,
        category_group TEXT,
        source_key     TEXT,
        transaction_id TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (status <> 'active' OR (name IS NOT NULL AND amount IS NOT NULL AND frequency IS NOT NULL AND kind IS NOT NULL AND next_date IS NOT NULL)),
        CHECK (status = 'active' OR source_key IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS idx_recurring_items_user ON recurring_items(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_items_user_source
        ON recurring_items(user_id, source_key) WHERE source_key IS NOT NULL;
    `);
  },
};
