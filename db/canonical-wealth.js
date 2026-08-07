'use strict';

const pool = require('./pool');
const { summarizeCanonicalSnapshot, normalizeMinorUnitInteger } = require('../lib/canonical-wealth');

async function listFinancialAccounts(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM financial_accounts WHERE user_id = $1 ORDER BY created_at, id`,
    [userId]
  );
  return rows;
}

async function listHoldings(userId, accountId = null) {
  const params = [userId];
  const accountClause = accountId == null ? '' : ` AND h.financial_account_id = $2`;
  if (accountId != null) params.push(accountId);
  const { rows } = await pool.query(
    `SELECT h.*, i.name AS instrument_name, i.instrument_type, i.ticker, i.isin, i.apir, i.exchange
       FROM holdings h
       JOIN instruments i ON i.id = h.instrument_id AND i.user_id = h.user_id
      WHERE h.user_id = $1${accountClause}
      ORDER BY h.as_of DESC, h.id DESC`,
    params
  );
  return rows;
}

async function listLatestValuations(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (subject_type, subject_key, classification) *
       FROM valuations
      WHERE user_id = $1
      ORDER BY subject_type, subject_key, classification, as_of DESC, id DESC`,
    [userId]
  );
  return rows;
}

async function listOwnershipInterests(userId, subjectType = null, subjectKey = null) {
  const params = [userId];
  let extra = '';
  if (subjectType != null && subjectKey != null) {
    params.push(subjectType, subjectKey);
    extra = ` AND subject_type = $2 AND subject_key = $3`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM ownership_interests
      WHERE user_id = $1${extra} AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY created_at, id`,
    params
  );
  return rows;
}

async function appendValuation(userId, data) {
  let amountMinor;
  try {
    amountMinor = normalizeMinorUnitInteger(data.amount_minor);
  } catch (cause) {
    const error = new Error(cause.message);
    error.statusCode = 400;
    throw error;
  }
  let supersedesId = null;
  if (data.supersedes_id != null) {
    const { rows: owned } = await pool.query(
      `SELECT id, subject_type, subject_key, classification, currency FROM valuations WHERE id = $1 AND user_id = $2`,
      [data.supersedes_id, userId]
    );
    if (!owned.length) throw new Error('Superseded valuation not found');
    const previous = owned[0];
    if (previous.subject_type !== data.subject_type || previous.subject_key !== data.subject_key ||
        previous.classification !== data.classification || previous.currency !== String(data.currency).toUpperCase()) {
      const error = new Error('Superseded valuation must describe the same subject, classification and currency');
      error.statusCode = 400;
      throw error;
    }
    supersedesId = owned[0].id;
  }
  const { rows } = await pool.query(
    `INSERT INTO valuations
       (user_id, subject_type, subject_key, classification, amount_minor, currency,
        as_of, source, confidence, supersedes_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [userId, data.subject_type, data.subject_key, data.classification,
     amountMinor, String(data.currency || 'AUD').toUpperCase(), data.as_of,
     data.source || 'manual', Number(data.confidence ?? 0.7), supersedesId,
     data.metadata || {}]
  );
  return rows[0];
}

async function getCanonicalSnapshot(userId) {
  const [accounts, holdings, valuations, ownershipInterests] = await Promise.all([
    listFinancialAccounts(userId),
    listHoldings(userId),
    listLatestValuations(userId),
    listOwnershipInterests(userId),
  ]);
  const normalizedValuations = valuations.map((row) => ({
    ...row,
    subjectType: row.subject_type,
    subjectKey: row.subject_key,
    amountMinor: row.amount_minor,
    asOf: row.as_of,
  }));
  return {
    accounts,
    holdings,
    valuations,
    ownershipInterests,
    summary: summarizeCanonicalSnapshot({ valuations: normalizedValuations, ownershipInterests }),
  };
}

module.exports = {
  listFinancialAccounts,
  listHoldings,
  listLatestValuations,
  listOwnershipInterests,
  appendValuation,
  getCanonicalSnapshot,
};
