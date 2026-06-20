module.exports = {
  name: 'asset_tables',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_accounts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Bank account',
        institution TEXT,
        account_type TEXT DEFAULT 'transaction',
        balance BIGINT NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'AUD',
        source TEXT DEFAULT 'manual',
        account_reference TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_cash_accounts_user ON cash_accounts(user_id);

      CREATE TABLE IF NOT EXISTS investments (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT DEFAULT 'other',
        ticker TEXT,
        units NUMERIC DEFAULT 0,
        value BIGINT NOT NULL DEFAULT 0,
        cost_basis BIGINT DEFAULT 0,
        currency TEXT DEFAULT 'AUD',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id);

      CREATE TABLE IF NOT EXISTS properties (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Property',
        address TEXT,
        property_type TEXT DEFAULT 'residential',
        value BIGINT NOT NULL DEFAULT 0,
        mortgage_balance BIGINT DEFAULT 0,
        rental_income BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);

      CREATE TABLE IF NOT EXISTS debts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Debt',
        kind TEXT DEFAULT 'other',
        balance BIGINT NOT NULL DEFAULT 0,
        interest_rate NUMERIC DEFAULT 0,
        min_payment BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);

      CREATE TABLE IF NOT EXISTS super_accounts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Super account',
        fund_name TEXT,
        balance BIGINT NOT NULL DEFAULT 0,
        employer_contrib BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_super_accounts_user ON super_accounts(user_id);

      CREATE TABLE IF NOT EXISTS incomes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT DEFAULT 'Primary income',
        kind TEXT DEFAULT 'salary',
        annual_amount BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_incomes_user ON incomes(user_id);

      CREATE TABLE IF NOT EXISTS other_assets (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        kind TEXT DEFAULT 'other',
        value BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_other_assets_user ON other_assets(user_id);
    `);
  },
};
