module.exports = {
  name: 'otp_brute_force',
  up: async (client) => {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMPTZ;
    `);
  },
};
