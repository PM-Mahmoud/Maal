/**
 * Migration: transaction_rule_conditions
 *
 * The redesigned "Create rule" flow lets a rule match on more than merchant
 * text: an amount comparison (equal to / greater than / less than), a set of
 * categories and a date range. Those extra conditions live in one nullable-safe
 * JSONB column on the user-owned `transaction_rules` table (created in
 * 1752600000000). Existing rules get '{}' and behave exactly as before.
 *
 * Additive only: ADD COLUMN IF NOT EXISTS with a default. Does NOT touch the
 * protected users / linked_accounts / transactions / session tables.
 */
module.exports = {
  name: 'transaction_rule_conditions',
  up: async (client) => {
    await client.query(`
      ALTER TABLE transaction_rules
        ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
  },
};
