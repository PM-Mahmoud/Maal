module.exports = {
  name: 'stripe_customer_id',
  up: async (client) => {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
    `);
  },
};
