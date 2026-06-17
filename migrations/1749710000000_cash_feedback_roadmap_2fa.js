// Adds: cash + monthly expenses to profiles (Total Cash stat, Cash Runway),
// two-factor flag on users, feedback table, and roadmap items with voting.
module.exports = {
  name: 'cash_feedback_roadmap_2fa',
  up: async (client) => {
    await client.query(`
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cash_savings NUMERIC DEFAULT 0;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS monthly_expenses NUMERIC DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS feedback (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        page TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS roadmap_items (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS roadmap_votes (
        item_id BIGINT NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (item_id, user_id)
      );
    `);

    // Seed the roadmap so the page isn't empty on first deploy
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM roadmap_items`);
    if (rows[0].n === 0) {
      await client.query(`
        INSERT INTO roadmap_items (title, details, status) VALUES
        ('Live market data for Top & Bottom Movers', 'Real-time ASX and US prices for your holdings.', 'planned'),
        ('Radar email & SMS alerts', 'Scheduled radar runs that actually notify you.', 'in_progress'),
        ('Statement parsing in Vault', 'Upload a PDF statement and Maal reads the transactions.', 'planned'),
        ('Shared access for partners & accountants', 'Invite a read-only viewer to your dashboard.', 'open')
      `);
    }
  },
};
