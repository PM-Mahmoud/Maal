module.exports = {
  name: 'asset_extra_columns',
  up: async (client) => {
    await client.query(`
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS mortgage_rate NUMERIC DEFAULT 0;
      ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS purchase_price BIGINT;
      ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS purchase_date DATE;
    `);
  },
};
