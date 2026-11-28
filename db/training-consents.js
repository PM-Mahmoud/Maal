'use strict';
// db/training-consents.js — append-only model-training consent log (spec D4).
// Every query is scoped by user_id in SQL (no RLS layer in Maal).

const pool = require('./pool');
const { POLICY_VERSION, SCOPES, SOURCES } = require('../lib/training-consent');

async function listForUser(userId) {
  const { rows } = await pool.query(
    `SELECT scope, granted, source, policy_version, created_at
       FROM training_consents
      WHERE user_id = $1
      ORDER BY created_at ASC, id ASC`,
    [userId]
  );
  return rows;
}

async function record(userId, { scope, granted, source }) {
  if (!SCOPES.includes(scope)) throw new Error('invalid consent scope');
  if (!SOURCES.includes(source)) throw new Error('invalid consent source');
  await pool.query(
    `INSERT INTO training_consents (user_id, scope, granted, source, policy_version)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, scope, granted === true, source, POLICY_VERSION]
  );
}

// Opt-in only (Mahmoud, 29 Nov 2026): sign-up never records a grant. A user is
// eligible only after choosing "Allow" in the notice or Settings.
module.exports = { listForUser, record };
