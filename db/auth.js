// db/auth.js
// Postgres session store (connect-pg-simple, 30-day persistent sessions).
//
// Reuses the SINGLE shared pool from db/pool.js instead of opening a second
// one. Previously this file created its own `__authPool` (pg default max 10)
// alongside db/pool.js's `__maalPool` (max 8) — up to 18 concurrent Postgres
// connections, each costing memory here and compute on Neon. One capped pool
// is plenty for this workload and much easier on a small instance.

const pool = require('./pool');

// ─── Session store (Postgres-backed) ─────────────────────────────────────

const session = require('express-session');
const PgSessionStore = require('connect-pg-simple')(session);

const sessionStore = new PgSessionStore({
  pool,
  tableName: 'session',
  createTableIfMissing: true,
  // Prune expired sessions hourly instead of the default 15 min — the table is
  // tiny and this trims needless DELETE traffic to Neon.
  pruneSessionInterval: 60 * 60,
  // express-session otherwise UPDATEs the session row on EVERY request just to
  // slide its expiry. Sessions are not rolling (the cookie expires 30 days after
  // login regardless), so that write bought nothing and cost a DB round-trip.
  disableTouch: true,
});

module.exports = { pool, sessionStore };
