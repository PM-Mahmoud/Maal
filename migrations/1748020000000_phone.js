'use strict';
const { pool } = require('../db/pool');

async function up() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
  `);
  console.log('Migration: phone columns added');
}

up().catch(err => { console.error(err); process.exit(1); });
