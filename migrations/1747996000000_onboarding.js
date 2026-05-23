/**
 * Migration: onboarding
 *
 * Creates:
 *   onboarding_sessions   — tracks wizard state (current step, completion)
 *   onboarding_responses  — step-by-step form data, one row per (session, step)
 *
 * Note on onboarding_responses:
 *   The db/onboarding.js upsertResponse function dynamically maps form field
 *   names to columns. All known onboarding fields are declared here as nullable
 *   TEXT/NUMERIC columns. Any unrecognised field from req.body will cause a
 *   Postgres "column does not exist" error — add new columns here if you add
 *   new onboarding form fields.
 *
 *   Known bug: routes/onboarding.js spreads req.body into dataToSave, which
 *   includes session_id. If the frontend submits session_id as a form field,
 *   the INSERT will fail with "column specified more than once". The fix is to
 *   filter session_id out of dataToSave before calling upsertResponse.
 */
module.exports = {
  name: 'onboarding',
  up: async (client) => {
    // ── onboarding_sessions ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_sessions (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        current_step   INTEGER DEFAULT 1,
        is_complete    BOOLEAN DEFAULT false,
        last_active_at TIMESTAMPTZ DEFAULT NOW(),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS onboarding_sessions_user_id_idx
        ON onboarding_sessions (user_id)
    `);

    // ── onboarding_responses ──────────────────────────────────────────────
    // One row per (session_id, step). Columns map to form field names
    // submitted by the frontend for each of the 7 wizard steps.
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_responses (
        id                       SERIAL PRIMARY KEY,
        session_id               INTEGER NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
        step                     INTEGER NOT NULL,
        user_id                  INTEGER,

        -- Step 1: Identity
        role                     TEXT,
        employment_type          TEXT,
        years_in_practice        TEXT,

        -- Step 2: Income
        income_range             TEXT,
        hecs_balance             TEXT,
        hecs_remaining           TEXT,
        other_personal_debt      TEXT,

        -- Step 3: Super & Savings
        super_balance            TEXT,
        super_fund_type          TEXT,
        employer_contrib_rate    TEXT,
        monthly_savings          TEXT,
        emergency_months         TEXT,

        -- Step 4: Investments
        investment_balance       TEXT,
        brokerage_accounts       TEXT,
        "brokerageAccounts"      TEXT,

        -- Step 5: Property & Debt
        mortgage_balance         TEXT,
        investment_property_debt TEXT,
        property_value           TEXT,

        -- Step 6: Goals & Retirement
        target_retirement_age    TEXT,
        goals                    TEXT,
        risk_tolerance           TEXT,

        -- Step 7: Ethics & Values
        is_muslim                TEXT,
        prefers_halal            TEXT,
        prefers_esg              TEXT,

        -- Metadata
        is_complete              BOOLEAN DEFAULT false,
        completed_at             TIMESTAMPTZ,
        created_at               TIMESTAMPTZ DEFAULT NOW(),
        updated_at               TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE (session_id, step)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS onboarding_responses_session_idx
        ON onboarding_responses (session_id)
    `);
  },
};
