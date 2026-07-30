// db/auth.js
// Pool singleton + Postgres session store. Uses connect-pg-simple for persistent
// 30-day sessions across server restarts.

const { Pool } = require('pg');
const { databaseSsl } = require('./ssl');

if (!global.__authPool) {
  global.__authPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl(process.env.DATABASE_URL),
  });
}

const pool = global.__authPool;

// ─── Session store (Postgres-backed) ─────────────────────────────────────

const session = require('express-session');
const PgSessionStore = require('connect-pg-simple')(session);

const sessionStore = new PgSessionStore({
  pool,
  tableName: 'session',
  createTableIfMissing: true,
});

module.exports = { pool, sessionStore };
