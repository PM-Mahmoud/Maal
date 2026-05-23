/**
 * Migration: recommended_tools
 *
 * Creates the recommended_tools catalogue table and seeds 30 curated tools
 * for Australian health professionals (halal + ESG finance platforms).
 *
 * Columns:
 *   tier_access   — 'basic' | 'pro' | 'elite' | 'all'
 *   profile_tags  — text[] matching buildProfileTags() in db/recommended-tools.js
 *                   values: 'general', 'smsf', 'non_smsf', 'property_investor'
 *   category      — matches routes/tools.js categories array
 *   region        — 'AU' | 'UK' | 'Global'
 *   halal_relevant — true = shown first for Muslim users
 *   always_show   — bypasses tier/profile gating
 *   active        — soft-delete flag
 *   display_order — sort order within category
 */
module.exports = {
  name: 'recommended_tools',
  up: async (client) => {
    // ── Table ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommended_tools (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        url             VARCHAR(500),
        logo_url        VARCHAR(500),
        category        VARCHAR(100) NOT NULL,
        region          VARCHAR(50)  DEFAULT 'AU',
        tier_access     VARCHAR(20)  DEFAULT 'basic',
        profile_tags    TEXT[]       DEFAULT '{}',
        halal_relevant  BOOLEAN      DEFAULT false,
        always_show     BOOLEAN      DEFAULT false,
        active          BOOLEAN      DEFAULT true,
        display_order   INTEGER      DEFAULT 99,
        created_at      TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS recommended_tools_category_idx
        ON recommended_tools (category)
    `);

    // ── Seed data — 30 tools ──────────────────────────────────────────────
    const tools = [
      // ── Screening ──────────────────────────────────────────────────────
      {
        name: 'Zoya',
        description: 'Shariah-compliant stock screener. Instant halal ratings for ASX, NYSE, and 40,000+ global stocks. Free tier available.',
        url: 'https://zoya.finance',
        category: 'Screening',
        region: 'Global',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: true,
        display_order: 1,
      },
      {
        name: 'Musaffa',
        description: 'AI-powered halal stock screener. Covers Islamic compliance, purification amounts, and portfolio-level Shariah scoring.',
        url: 'https://musaffa.com',
        category: 'Screening',
        region: 'Global',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 2,
      },
      {
        name: 'Sustainalytics',
        description: 'Morningstar\'s ESG research platform. Used by institutional investors to screen stocks for environmental and social criteria.',
        url: 'https://www.sustainalytics.com',
        category: 'Screening',
        region: 'Global',
        tier_access: 'pro',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 3,
      },
      {
        name: 'Refinitiv ESG Scores',
        description: 'ESG data from LSEG covering 10,000+ public companies. Used for institutional ESG screening and portfolio analytics.',
        url: 'https://www.lseg.com/en/data-analytics/sustainable-finance',
        category: 'Screening',
        region: 'Global',
        tier_access: 'elite',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 4,
      },

      // ── Equities ───────────────────────────────────────────────────────
      {
        name: 'Stake',
        description: 'Commission-free investing in ASX and US markets. Popular with Australian health professionals for its clean UI and no brokerage fees on US trades.',
        url: 'https://au.stake.com',
        category: 'Equities',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: true,
        display_order: 1,
      },
      {
        name: 'Superhero',
        description: 'ASX and US share trading with $0 brokerage on ETF trades. Strong for building a diversified ETF portfolio.',
        url: 'https://www.superhero.com.au',
        category: 'Equities',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 2,
      },
      {
        name: 'SelfWealth',
        description: 'Low-cost ASX brokerage at $9.50 flat rate. Includes community portfolio benchmarking and performance tracking.',
        url: 'https://www.selfwealth.com.au',
        category: 'Equities',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 3,
      },
      {
        name: 'Interactive Brokers',
        description: 'Professional-grade global brokerage with access to 150 markets. Best for high-volume traders and SMSF accounts.',
        url: 'https://www.interactivebrokers.com.au',
        category: 'Equities',
        region: 'Global',
        tier_access: 'pro',
        profile_tags: ['smsf'],
        halal_relevant: false,
        always_show: false,
        display_order: 4,
      },
      {
        name: 'BetaShares (ETHI)',
        description: 'BetaShares Global Sustainability Leaders ETF (ASX:ETHI). Screens out fossil fuels, weapons, gambling, and tobacco. 100+ quality global companies.',
        url: 'https://www.betashares.com.au/fund/global-sustainability-leaders-etf/',
        category: 'Equities',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 5,
      },
      {
        name: 'Vanguard (VESG)',
        description: 'Vanguard MSCI International Shares ESG ETF (ASX:VESG). Excludes controversial sectors and companies with poor ESG scores. 0.18% management fee.',
        url: 'https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8225',
        category: 'Equities',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 6,
      },

      // ── Sukuk ──────────────────────────────────────────────────────────
      {
        name: 'Hejaz Financial Services',
        description: 'Australia\'s leading Islamic financial services firm. Offers Shariah-compliant home finance, super, and investments regulated by ASIC.',
        url: 'https://hejaz.com.au',
        category: 'Sukuk',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: true,
        display_order: 1,
      },
      {
        name: 'MCCA (Muslim Community Cooperative)',
        description: 'Australia\'s first Islamic financial institution. Provides halal home finance, savings accounts, and investment products under the Murabaha model.',
        url: 'https://www.mcca.com.au',
        category: 'Sukuk',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 2,
      },
      {
        name: 'iShares USD Short Term Sukuk (SUKU)',
        description: 'iShares J.P. Morgan USD EM Sukuk ETF — short-duration Shariah-compliant bonds with ~4.5% yield. Available via most Australian brokers.',
        url: 'https://www.blackrock.com/au/products/307357/',
        category: 'Sukuk',
        region: 'Global',
        tier_access: 'pro',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 3,
      },

      // ── Precious Metals ────────────────────────────────────────────────
      {
        name: 'ABC Bullion',
        description: 'Australia\'s largest independently-owned precious metals dealer. Buy and store physical gold and silver. LBMA-certified, Shariah-compliant asset class.',
        url: 'https://www.abcbullion.com.au',
        category: 'Precious Metals',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: true,
        display_order: 1,
      },
      {
        name: 'Perth Mint',
        description: 'Government-backed gold and silver. Perth Mint Gold Token (PMGT) is a blockchain-backed gold token on Ethereum — auditable, fully backed by physical gold in the Perth Mint vault.',
        url: 'https://www.perthmint.com',
        category: 'Precious Metals',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 2,
      },
      {
        name: 'BullionVault',
        description: 'World\'s largest online gold and silver platform. Own allocated gold in Zurich, London, New York, Singapore, or Toronto vaults. Daily trading.',
        url: 'https://www.bullionvault.com',
        category: 'Precious Metals',
        region: 'Global',
        tier_access: 'pro',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 3,
      },

      // ── Commodities ────────────────────────────────────────────────────
      {
        name: 'SPDR S&P/ASX 200 Resources ETF',
        description: 'ASX:OZR — Tracks the S&P/ASX 200 Resources sector. Provides exposure to Australian mining and energy commodities. Screened for ESG concerns.',
        url: 'https://www.ssga.com/au/en_gb/individual/etfs/funds/spdr-sp-asx-200-resources-fund-ozr',
        category: 'Commodities',
        region: 'AU',
        tier_access: 'pro',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 1,
      },
      {
        name: 'VanEck Vectors Gold Miners ETF',
        description: 'ASX:GDX — Exposure to global gold mining companies. Indirect gold exposure with leverage to bullion prices. Screened against weapons manufacturers.',
        url: 'https://www.vaneck.com.au/etf/equity/gdx/snapshot/',
        category: 'Commodities',
        region: 'Global',
        tier_access: 'pro',
        profile_tags: ['{}'],
        halal_relevant: true,
        always_show: false,
        display_order: 2,
      },

      // ── Alternatives ───────────────────────────────────────────────────
      {
        name: 'BrickX',
        description: 'Fractional property investment on the ASX. Buy "bricks" (1/10,000th of a property) from $60. Generates rental income proportional to your holding.',
        url: 'https://www.brickx.com',
        category: 'Alternatives',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['property_investor', 'non_smsf'],
        halal_relevant: false,
        always_show: false,
        display_order: 1,
      },
      {
        name: 'CrowdProperty',
        description: 'Property-backed P2P lending in Australia. Earn 8–10% p.a. from first-mortgage secured development loans. Minimum $1,000 investment.',
        url: 'https://www.crowdproperty.com.au',
        category: 'Alternatives',
        region: 'AU',
        tier_access: 'pro',
        profile_tags: ['property_investor'],
        halal_relevant: false,
        always_show: false,
        display_order: 2,
      },
      {
        name: 'AltX',
        description: 'Wholesale alternative investments: private credit, infrastructure, venture debt. Minimum $10,000. For accredited investors (income >$250k).',
        url: 'https://www.altx.com.au',
        category: 'Alternatives',
        region: 'AU',
        tier_access: 'elite',
        profile_tags: ['general'],
        halal_relevant: false,
        always_show: false,
        display_order: 3,
      },
      {
        name: 'Australian Ethical Infrastructure Debt',
        description: 'Impact investing in Australian essential services and green infrastructure. Fixed income, impact-aligned, wholesale investors only.',
        url: 'https://www.australianethical.com.au',
        category: 'Alternatives',
        region: 'AU',
        tier_access: 'elite',
        profile_tags: ['general'],
        halal_relevant: true,
        always_show: false,
        display_order: 4,
      },

      // ── Startups ───────────────────────────────────────────────────────
      {
        name: 'Birchal',
        description: 'Australia\'s leading equity crowdfunding platform. Invest in early-stage Australian companies from $50. Screened against prohibited industries.',
        url: 'https://www.birchal.com',
        category: 'Startups',
        region: 'AU',
        tier_access: 'basic',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 1,
      },
      {
        name: 'OnMarket',
        description: 'Australian IPO, bond, and growth company investment platform. Access pre-IPO and IPO allocations typically reserved for institutional investors.',
        url: 'https://www.onmarket.com.au',
        category: 'Startups',
        region: 'AU',
        tier_access: 'pro',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 2,
      },
      {
        name: 'AngelList Australia',
        description: 'Venture capital rolling funds and startup syndicates. Access to curated startup deals alongside professional VCs. USD-denominated.',
        url: 'https://angellist.com',
        category: 'Startups',
        region: 'Global',
        tier_access: 'elite',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 3,
      },
      {
        name: 'Skalata Ventures',
        description: 'Australia\'s largest pure-play seed fund. Backs Australian health-tech and deep-tech startups. Co-investment opportunities available to angel investors.',
        url: 'https://www.skalata.com.au',
        category: 'Startups',
        region: 'AU',
        tier_access: 'elite',
        profile_tags: ['{}'],
        halal_relevant: false,
        always_show: false,
        display_order: 4,
      },
    ];

    for (const tool of tools) {
      const tags = Array.isArray(tool.profile_tags)
        ? tool.profile_tags.filter(t => t !== '{}')
        : [];
      const tagsLiteral = tags.length > 0
        ? `{${tags.map(t => `"${t}"`).join(',')}}`
        : '{}';

      await client.query(
        `INSERT INTO recommended_tools
           (name, description, url, category, region, tier_access, profile_tags,
            halal_relevant, always_show, active, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
         ON CONFLICT DO NOTHING`,
        [
          tool.name,
          tool.description,
          tool.url,
          tool.category,
          tool.region,
          tool.tier_access,
          tagsLiteral,
          tool.halal_relevant,
          tool.always_show,
          tool.display_order,
        ]
      );
    }
  },
};
