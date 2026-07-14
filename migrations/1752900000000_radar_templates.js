// PR 9 — Radar upgrades: curated template marketplace + richer scheduling.
//
// Additive-only. `radar_templates` is a NEW curated table (no user FK — these are
// app content, SQL-editable without a deploy, reviewed in the PR). The scheduling
// columns are added to `radars` (a per-user feature table, NOT one of the
// protected tables users/transactions/session/linked_accounts), so this is
// non-destructive.
//
// AU content is the moat: 5 categories (Super & Tax / Portfolio / Property /
// Cash Flow / Market Events) x 3 wealth stages (Getting Started / Building /
// Established) = 15 seeded templates. Edit or add rows with plain SQL.
const TEMPLATES = [
  // category, wealth_stage, slug, title, sub, prompt, default_frequency
  ['super_tax', 'getting_started', 'super_tax_start', 'Super co-contribution', 'Free government money if you qualify', "Watch for government co-contribution eligibility for me and remind me before 30 June if my super fund's fees look high.", 'monthly'],
  ['super_tax', 'building', 'super_tax_cap', 'Concessional cap pacing', "Don't accidentally blow the $30k cap", 'Track my concessional (pre-tax) super contributions against the annual cap and warn me if I am on pace to exceed it before 30 June.', 'monthly'],
  ['super_tax', 'established', 'super_tax_div293', 'Div 293 & carry-forward', 'High-income super traps and unused cap', 'Alert me if my income plus super contributions approach the Division 293 $250,000 threshold, and flag any unused carry-forward concessional cap I could use.', 'monthly'],

  ['portfolio', 'getting_started', 'portfolio_start', 'First ETF check-in', 'Plain-English news on your index funds', 'Tell me when there is major news about the broad ASX or global index ETFs I hold, explained simply for a long-term investor.', 'weekly'],
  ['portfolio', 'building', 'portfolio_drift', 'Concentration & drift', 'Keep your allocation on target', 'Warn me if any single holding grows past 20% of my portfolio, or if my allocation drifts a long way from my target mix.', 'weekly'],
  ['portfolio', 'established', 'portfolio_franking', 'Franking season', 'Dividends and franking credits', 'During dividend and franking season, flag ex-dividend dates and franking credits for my ASX holdings.', 'weekly'],

  ['property', 'getting_started', 'property_start', 'First-home saver watch', 'Rates, borrowing power and FHSSS', 'Watch RBA cash-rate decisions and explain what they mean for my borrowing power and the First Home Super Saver scheme.', 'weekly'],
  ['property', 'building', 'property_rate', 'Mortgage rate moves', 'Know the moment repayments change', 'Alert me when the RBA changes the cash rate or my lender moves its variable rate, and what it means for my repayments.', 'weekly'],
  ['property', 'established', 'property_tax', 'Negative gearing & CGT', 'Investment-property tax reminders', 'Flag tax-time reminders on negative gearing deductions and the CGT discount for my investment property.', 'monthly'],

  ['cash_flow', 'getting_started', 'cash_flow_start', 'Emergency fund watch', 'Keep a safety buffer in place', 'Nudge me if my cash buffer falls below one month of my usual expenses.', 'weekly'],
  ['cash_flow', 'building', 'cash_flow_creep', 'Bill & subscription creep', 'Catch quiet cost increases', 'Warn me if my recurring subscriptions or regular bills rise noticeably from one month to the next.', 'monthly'],
  ['cash_flow', 'established', 'cash_flow_offset', 'Offset & savings rate', 'Put idle cash to work', 'Track my savings rate and flag when idle cash could be working harder in my mortgage offset or a higher-rate savings account.', 'monthly'],

  ['market_events', 'getting_started', 'market_start', 'Big market moves only', 'Signal, not daily noise', 'Only tell me about market events big enough to matter for a long-term investor — skip the day-to-day noise.', 'weekly'],
  ['market_events', 'building', 'market_reporting', 'ASX reporting season', 'Results for what you own', 'During ASX reporting season, summarise results for the companies and ETFs I hold.', 'weekly'],
  ['market_events', 'established', 'market_macro', 'Macro & RBA calendar', 'Ahead of the big decisions', 'Give me a heads-up before RBA decisions, US Fed meetings and major Australian economic data releases.', 'weekly'],
];

module.exports = {
  name: 'radar_templates',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS radar_templates (
        id            BIGSERIAL PRIMARY KEY,
        slug          TEXT UNIQUE NOT NULL,
        category      TEXT NOT NULL,
        wealth_stage  TEXT NOT NULL,
        title         TEXT NOT NULL,
        sub           TEXT,
        prompt        TEXT NOT NULL,
        default_frequency TEXT NOT NULL DEFAULT 'weekly',
        sort_order    INTEGER NOT NULL DEFAULT 0,
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      -- Richer scheduling on radars (additive; radars is not a protected table).
      ALTER TABLE radars ADD COLUMN IF NOT EXISTS time_aest    TEXT;    -- 'HH:MM' local send time
      ALTER TABLE radars ADD COLUMN IF NOT EXISTS schedule_day SMALLINT; -- 0=Sun..6=Sat for weekly
      ALTER TABLE radars ADD COLUMN IF NOT EXISTS timezone     TEXT NOT NULL DEFAULT 'Australia/Sydney';
      ALTER TABLE radars ADD COLUMN IF NOT EXISTS template_slug TEXT;
    `);

    // Seed the curated templates (idempotent on slug).
    let order = 0;
    for (const [category, wealth_stage, slug, title, sub, prompt, freq] of TEMPLATES) {
      await client.query(
        `INSERT INTO radar_templates (slug, category, wealth_stage, title, sub, prompt, default_frequency, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (slug) DO NOTHING`,
        [slug, category, wealth_stage, title, sub, prompt, freq, order++]
      );
    }
  },
};
