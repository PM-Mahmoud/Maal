// Shared pg Pool singleton
const { Pool } = require('pg');
const { databaseSsl } = require('./ssl');

if (!global.__maalPool) {
  global.__maalPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl(process.env.DATABASE_URL),
    // Single shared pool for the whole app (db/auth.js reuses this too).
    // 5 is ample for this workload and keeps memory + Neon compute low; idle
    // connections are released after 10s so they don't sit warm on Neon.
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}
module.exports = global.__maalPool;
