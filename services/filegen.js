// services/filegen.js — AI-generated files from the user's REAL data (PR 11).
//
// Composes the existing data layer + report + email: loads the caller's own data,
// renders it as CSV / Excel (SpreadsheetML) / PDF, and emails it as an attachment
// via Resend. Figures are never fabricated — every value comes from the user's
// records. Metering (ai_files, Pro/Max) is enforced at the route.

const fileBuilders = require('../lib/file-builders');
const { getProfileByUserId } = require('../db/profiles');
const assetsDb = require('../db/assets');
const { snapshotValuesFromProfile, getSnapshots } = require('../db/snapshots');
const { findUserById } = require('../db/users');

const FILE_TYPES = new Set(['csv', 'excel', 'pdf']);
const DATASETS = new Set(['net_worth', 'transactions', 'goals', 'balances']);

function normType(t) {
  const s = String(t || '').toLowerCase();
  if (s === 'xlsx' || s === 'xls' || s === 'spreadsheet') return 'excel';
  return s;
}

// Load exactly the data a dataset needs (nothing more), all scoped to userId.
async function loadDatasetData(userId, dataset) {
  const data = {};
  const rawProfile = (await getProfileByUserId(userId)) || {};
  const assetSummary = await assetsDb.getAssetSummary(userId);
  const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
  data.snap = snapshotValuesFromProfile(profile);

  if (dataset === 'net_worth') {
    data.snapshots = await getSnapshots(userId, 365).catch(() => []);
  } else if (dataset === 'transactions') {
    const txnDb = require('../db/transactions');
    data.transactions = await txnDb.getTxnsSince(userId, 365, 1000).catch(() => []);
  } else if (dataset === 'goals') {
    const goalsDb = require('../db/goals');
    data.goals = await goalsDb.listGoals(userId).catch(() => []);
  }
  return data;
}

// Build a { filename, mime, base64, title } file. Never throws on empty data.
async function generateFile(userId, { type, dataset }) {
  const t = normType(type);
  if (!FILE_TYPES.has(t)) throw new Error('Unsupported file type');

  // PDF = the existing financial-snapshot report (real data, already tested).
  if (t === 'pdf') {
    const { generateFinancialReport } = require('./report');
    const { filename, base64 } = await generateFinancialReport(userId);
    return { filename, base64, mime: 'application/pdf', title: 'Your Maal financial snapshot' };
  }

  const ds = DATASETS.has(dataset) ? dataset : 'net_worth';
  const data = await loadDatasetData(userId, ds);
  const built = fileBuilders.buildDataset(ds, data);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `maal-${ds.replace(/_/g, '-')}-${stamp}`;

  if (t === 'csv') {
    const csv = fileBuilders.toCsv(built.columns, built.rows);
    return {
      filename: `${base}.csv`,
      mime: 'text/csv',
      base64: Buffer.from(csv, 'utf-8').toString('base64'),
      title: built.title,
    };
  }
  // excel → SpreadsheetML (.xls, opens natively in Excel; no zip dependency).
  const xml = fileBuilders.toSpreadsheetXml(built.sheet, built.columns, built.rows);
  return {
    filename: `${base}.xls`,
    mime: 'application/vnd.ms-excel',
    base64: Buffer.from(xml, 'utf-8').toString('base64'),
    title: built.title,
  };
}

// Generate + email the file to the requesting user. Returns { emailedTo, filename }.
async function generateAndEmailFile(userId, { type, dataset }) {
  const user = await findUserById(userId);
  if (!user || !user.email) throw new Error('No email on file');
  const file = await generateFile(userId, { type, dataset });
  const { sendGeneratedFile } = require('./email');
  await sendGeneratedFile(user, file);
  return { emailedTo: user.email, filename: file.filename };
}

module.exports = { generateFile, generateAndEmailFile, loadDatasetData, FILE_TYPES, DATASETS };
