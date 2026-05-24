/**
 * Migration: auth_security
 * Adds OTP verification, account lockout, and last_login tracking to users.
 */
module.exports = {
  name: 'auth_security',
  up: async (client) => {
    // OTP email verification (replaces magic link)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ`);

    // Account lockout after repeated failed logins
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);

    // Audit trail
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)`);

    // Index for admin queries
    await client.query(`CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC)`);
  },
};
