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

// Signup paths call this after the user saw the disclosure. It must never fail
// a signup: errors are logged (no PII) and swallowed.
async function recordSignupGrant(userId, source) {
  try {
    await record(userId, { scope: 'general', granted: true, source });
  } catch (e) {
    console.error('[training-consent] signup grant not recorded:', e.message);
  }
}

module.exports = { listForUser, record, recordSignupGrant };
