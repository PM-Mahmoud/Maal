// Shared pg Pool singleton
const { Pool } = require('pg');
if (!global.__maalPool) {
  global.__maalPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}
module.exports = global.__maalPool;
