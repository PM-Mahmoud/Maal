// PR 7 — Source-linked live goals.
//
// Purely ADDITIVE columns on the existing `goals` table. No column is dropped or
// retyped, so this is non-destructive and safe to auto-apply (goals is a
// per-user feature table, NOT one of the protected tables
// users/transactions/session/linked_accounts).
//
// Background: the React goals page has been writing category/target_amount/
// current_amount/target_date/description/source since the frontend
// consolidation, but those columns never existed on `goals` (it only had
// name/type/target/current), so every create silently 500'd. This migration
// lands the columns the client already expects AND the new source-linking
// columns that let progress be DERIVED from live financials instead of typed by
// hand:
//   source_type   — 'manual' | 'net_worth' | 'cash' | 'super' | 'investments' | 'debts'
//   target_kind   — 'amount' | 'percent'  (percent = grow the source by N%)
//   target_pct    — the N when target_kind='percent'
//   baseline_amount — the source's value captured at creation. Needed so
//                     "Pay Off" progress = baseline_debt - live_debt (cleared so
//                     far) and "grow by %" targets = baseline * (1 + pct/100).
//
// The legacy type/target/current columns are left in place untouched for
// backward compatibility (db/goals.js reads/writes the new columns).
module.exports = {
  name: 'goals_live_source',
  up: async (client) => {
    await client.query(`
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS category        TEXT;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_amount   NUMERIC NOT NULL DEFAULT 0;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS current_amount  NUMERIC NOT NULL DEFAULT 0;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_date     DATE;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS description     TEXT;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS source_type     TEXT NOT NULL DEFAULT 'manual'
        CHECK (source_type IN ('manual','net_worth','cash','super','investments','debts'));
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_kind     TEXT NOT NULL DEFAULT 'amount'
        CHECK (target_kind IN ('amount','percent'));
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_pct      NUMERIC;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS baseline_amount NUMERIC;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
    `);
  },
};
