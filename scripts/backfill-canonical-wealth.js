'use strict';

// Idempotently projects legacy asset tables into W1.2 canonical wealth records.
// Existing legacy tables remain untouched and continue to serve the UI during
// compatibility rollout. Never logs PII.

const { Client } = require('pg');
const {
  projectLegacyWealthRows,
  compareLegacyAndCanonical,
} = require('../lib/canonical-wealth');

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify');

async function loadLegacyRows(client, userId) {
  const query = (table) => client.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY id`, [userId]).then((r) => r.rows);
  const [cashAccounts, investments, properties, debts, superAccounts, otherAssets] = await Promise.all([
    query('cash_accounts'), query('investments'), query('properties'), query('debts'),
    query('super_accounts'), query('other_assets'),
  ]);
  return { cashAccounts, investments, properties, debts, superAccounts, otherAssets };
}

async function persistProjection(client, projection) {
  const accountIds = new Map();
  const instrumentIds = new Map();

  for (const row of projection.accounts) {
    const { rows } = await client.query(
      `INSERT INTO financial_accounts
         (user_id, account_type, name, institution, currency, source, confidence, as_of, legacy_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, legacy_key) DO UPDATE SET
         account_type = EXCLUDED.account_type, name = EXCLUDED.name,
         institution = EXCLUDED.institution, currency = EXCLUDED.currency,
         source = EXCLUDED.source, confidence = EXCLUDED.confidence, as_of = EXCLUDED.as_of,
         updated_at = NOW()
       RETURNING id`,
      [row.userId, row.accountType, row.name, row.institution, row.currency, row.source,
       row.confidence, row.asOf, row.legacyKey]
    );
    accountIds.set(row.legacyKey, rows[0].id);
  }

  for (const row of projection.instruments) {
    const { rows } = await client.query(
      `INSERT INTO instruments
         (user_id, name, instrument_type, ticker, currency, legacy_key)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, legacy_key) DO UPDATE SET
         name = EXCLUDED.name, instrument_type = EXCLUDED.instrument_type,
         ticker = EXCLUDED.ticker, currency = EXCLUDED.currency, updated_at = NOW()
       RETURNING id`,
      [row.userId, row.name, row.instrumentType, row.ticker, row.currency, row.legacyKey]
    );
    instrumentIds.set(row.legacyKey, rows[0].id);
  }

  for (const row of projection.holdings) {
    await client.query(
      `INSERT INTO holdings
         (user_id, financial_account_id, instrument_id, units, cost_basis_minor,
          currency, as_of, source, confidence, legacy_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, legacy_key) DO UPDATE SET
         owner_type = EXCLUDED.owner_type, ownership_percent = EXCLUDED.ownership_percent,
         effective_from = EXCLUDED.effective_from, updated_at = NOW()`,
      [row.userId, accountIds.get(row.accountKey), instrumentIds.get(row.instrumentKey),
       row.units, row.costBasisMinor, row.currency, row.asOf, row.source, row.confidence,
       row.legacyKey]
    );
  }

  for (const row of projection.valuations) {
    await client.query(
      `INSERT INTO valuations
         (user_id, subject_type, subject_key, classification, amount_minor, currency,
          as_of, source, confidence, legacy_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, legacy_key) DO NOTHING`,
      [row.userId, row.subjectType, row.subjectKey, row.classification, row.amountMinor,
       row.currency, row.asOf, row.source, row.confidence, row.legacyKey]
    );
  }

  for (const row of projection.ownershipInterests) {
    await client.query(
      `INSERT INTO ownership_interests
         (user_id, subject_type, subject_key, owner_type, ownership_percent,
          effective_from, legacy_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, legacy_key) DO NOTHING`,
      [row.userId, row.subjectType, row.subjectKey, row.ownerType,
       row.ownershipPercent, row.effectiveFrom, row.legacyKey]
    );
  }
}

async function loadCanonicalProjection(client, userId) {
  const [accounts, instruments, holdings, valuations, ownershipInterests] = await Promise.all([
    client.query('SELECT * FROM financial_accounts WHERE user_id = $1', [userId]).then((r) => r.rows),
    client.query('SELECT * FROM instruments WHERE user_id = $1', [userId]).then((r) => r.rows),
    client.query('SELECT * FROM holdings WHERE user_id = $1', [userId]).then((r) => r.rows),
    client.query('SELECT * FROM valuations WHERE user_id = $1', [userId]).then((r) => r.rows),
    client.query('SELECT * FROM ownership_interests WHERE user_id = $1', [userId]).then((r) => r.rows),
  ]);
  return {
    accounts,
    instruments,
    holdings,
    ownershipInterests,
    valuations: valuations.map((row) => ({
      subjectType: row.subject_type,
      subjectKey: row.subject_key,
      classification: row.classification,
      amountMinor: row.amount_minor,
      asOf: row.as_of,
      currency: row.currency,
    })),
  };
}

async function backfillUser(client, userId) {
  const legacy = await loadLegacyRows(client, userId);
  const projection = projectLegacyWealthRows(userId, legacy);
  if (!DRY_RUN && !VERIFY_ONLY) await persistProjection(client, projection);
  const canonical = DRY_RUN ? projection : await loadCanonicalProjection(client, userId);
  return { projection, parity: compareLegacyAndCanonical(legacy, canonical) };
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: users } = await client.query(`
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM cash_accounts UNION ALL SELECT user_id FROM investments
        UNION ALL SELECT user_id FROM properties UNION ALL SELECT user_id FROM debts
        UNION ALL SELECT user_id FROM super_accounts UNION ALL SELECT user_id FROM other_assets
      ) wealth_users ORDER BY user_id
    `);
    let matched = 0;
    for (const { user_id: userId } of users) {
      await client.query('BEGIN');
      try {
        const result = await backfillUser(client, userId);
        if (!result.parity.matches) throw new Error(`parity mismatch for user ${userId}: delta=${result.parity.delta}`);
        if (DRY_RUN || VERIFY_ONLY) await client.query('ROLLBACK'); else await client.query('COMMIT');
        matched++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log(`${DRY_RUN ? 'Would backfill' : VERIFY_ONLY ? 'Verified' : 'Backfilled'} ${matched} user(s); canonical parity matched.`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`backfill-canonical-wealth: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { loadLegacyRows, persistProjection, loadCanonicalProjection, backfillUser };
