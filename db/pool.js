// Shared pg Pool singleton
const { Client, Pool } = require('pg');
const queryMetrics = require('./query-metrics');
const { databaseSsl } = require('./ssl');

if (!global.__maalPool) {
  global.__maalPool = new Pool({
    ...(queryMetrics.enabled ? { Client: queryMetrics.instrumentClient(Client) } : {}),
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl(process.env.DATABASE_URL),
    // Single shared pool for the whole app (db/auth.js reuses this too).
    // A dashboard load fires ~20 API calls at once, each needing a session read
    // plus its own queries; at max 5 they queued for 20s+ (measured 2026-09-29).
    // 10 keeps memory modest; idle connections still release after 10s.
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}
module.exports = global.__maalPool;
