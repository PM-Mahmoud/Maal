'use strict';

// scripts/backfill-assets.js
// One-time data migration: copies each user's flat user_profiles asset
// columns (cash_savings, investment_portfolio, property_value, total_debt,
// super_balance) into one row per non-zero field in the new granular tables
// (db/assets.js). Non-destructive — only INSERTs into the new tables, never
// touches user_profiles. hecs_balance is explicitly NOT backfilled (stays a
// flat column — see the assets-liabilities plan).
//
// Run modes:
//   node scripts/backfill-assets.js --dry-run   — prints what would happen,
//                                                   writes nothing
//   node scripts/backfill-assets.js             — actually inserts rows
//   node scripts/backfill-assets.js --verify     — re-checks every already-
//                                                   backfilled user's new
//                                                   total against their flat
//                                                   total, logs mismatches
//
// Idempotent: a user who already has a source='backfill' row in a given
// table is skipped for that table on re-run.
//
// Per CLAUDE.md's PII rule: never print more than a user id + numbers to
// stdout. No emails, no names, no full profile dumps.

const { Client } = require('pg');
const assetsDb = require('../db/assets');

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify');

const FIELD_MAP = [
  { flatField: 'cash_savings', table: 'cash_accounts', list: assetsDb.listCashAccounts, create: assetsDb.createCashAccount,
    shape: (amount) => ({ label: 'Cash & savings', balance: amount, source: 'backfill' }) },
  { flatField: 'investment_portfolio', table: 'investments', list: assetsDb.listInvestments, create: assetsDb.createInvestment,
    shape: (amount) => ({ name: 'Investments', kind: 'other', value: amount, source: 'backfill' }) },
  { flatField: 'property_value', table: 'properties', list: assetsDb.listProperties, create: assetsDb.createProperty,
    shape: (amount) => ({ label: 'Property', value: amount, source: 'backfill' }) },
  { flatField: 'total_debt', table: 'debts', list: assetsDb.listDebts, create: assetsDb.createDebt,
    shape: (amount) => ({ label: 'Other debt', kind: 'other', balance: amount, source: 'backfill' }) },
  { flatField: 'super_balance', table: 'super_accounts', list: assetsDb.listSuperAccounts, create: assetsDb.createSuperAccount,
    shape: (amount) => ({ label: 'Superannuation', balance: amount, source: 'backfill' }) },
];

async function getEligibleProfiles(client) {
  const { rows } = await client.query(
    `SELECT user_id, cash_savings, investment_portfolio, property_value, total_debt, super_balance
     FROM user_profiles`
  );
  return rows;
}

async function backfillUser(profile) {
  const userId = profile.user_id;
  const results = [];
  for (const field of FIELD_MAP) {
    const amount = Math.round(Number(profile[field.flatField]) || 0);
    if (amount <= 0) continue; // skip zero/null — no empty rows

    const existingRows = await field.list(userId);
    const alreadyBackfilled = existingRows.some((r) => r.source === 'backfill');
    if (alreadyBackfilled) {
      results.push({ userId, table: field.table, action: 'skipped (already backfilled)' });
      continue;
    }

    if (DRY_RUN) {
      results.push({ userId, table: field.table, action: `would insert (balance=${amount})` });
      continue;
    }

    await field.create(userId, field.shape(amount));
    results.push({ userId, table: field.table, action: `inserted (balance=${amount})` });
  }
  return results;
}

// Pure: given a flat profile row and a granular asset summary, compute both
// totals and whether they match within a cent. No I/O — this is what
// test/backfill-assets.test.js exercises directly with fixtures.
function computeVerificationDelta(profile, summary) {
  const oldTotal =
    (Math.round(Number(profile.cash_savings) || 0)) +
    (Math.round(Number(profile.investment_portfolio) || 0)) +
    (Math.round(Number(profile.property_value) || 0)) +
    (Math.round(Number(profile.super_balance) || 0)) -
    (Math.round(Number(profile.total_debt) || 0));

  const newTotal = summary.cashTotal + summary.investmentsTotal + summary.propertyTotal + summary.superTotal - summary.debtsTotal;
  const delta = Math.abs(newTotal - oldTotal);
  return { oldTotal, newTotal, delta, matches: delta <= 1 };
}

async function verifyUser(profile) {
  const summary = await assetsDb.getAssetSummary(profile.user_id);
  const { oldTotal, newTotal, delta, matches } = computeVerificationDelta(profile, summary);
  if (!matches) {
    console.log(`MISMATCH user ${profile.user_id}: old=${oldTotal} new=${newTotal} delta=${delta}`);
    return false;
  }
  return true;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const profiles = await getEligibleProfiles(client);
    console.log(`Found ${profiles.length} user_profiles rows.`);

    if (VERIFY_ONLY) {
      console.log('\nVerifying backfilled totals against flat-column totals...\n');
      let ok = 0, mismatches = 0;
      for (const profile of profiles) {
        const passed = await verifyUser(profile);
        if (passed) ok++; else mismatches++;
      }
      console.log(`\n${ok} matched, ${mismatches} mismatched.\n`);
      process.exit(mismatches > 0 ? 1 : 0);
    }

    console.log(DRY_RUN ? '\nDRY RUN — no rows will be written.\n' : '\nBackfilling...\n');
    let inserted = 0, skipped = 0;
    for (const profile of profiles) {
      const results = await backfillUser(profile);
      for (const r of results) {
        console.log(`user ${r.userId}: ${r.table} — ${r.action}`);
        if (r.action.startsWith('inserted') || r.action.startsWith('would insert')) inserted++;
        else skipped++;
      }
    }
    console.log(`\n${inserted} row(s) ${DRY_RUN ? 'would be inserted' : 'inserted'}, ${skipped} skipped.\n`);

    if (!DRY_RUN) {
      console.log('Running post-backfill verification...\n');
      let ok = 0, mismatches = 0;
      for (const profile of profiles) {
        const passed = await verifyUser(profile);
        if (passed) ok++; else mismatches++;
      }
      console.log(`\n${ok} matched, ${mismatches} mismatched.\n`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('backfill-assets: fatal error:', e.message);
    process.exit(1);
  });
}

module.exports = { backfillUser, verifyUser, computeVerificationDelta, FIELD_MAP };
