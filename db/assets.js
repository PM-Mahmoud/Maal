// db/assets.js — CRUD for the 7 granular asset/liability tables
// (cash_accounts, investments, properties, debts, super_accounts, incomes,
// other_assets — see migrations/1750800000000_asset_tables.js).
//
// Every read/write is scoped by user_id in the SQL itself — IDOR pattern
// matches db/advisor.js getMessages(): fetch by id AND user_id together,
// return null on no match rather than fetching then checking ownership.

const pool = require('./pool');

// Builds a `col1 = $2, col2 = $3, ...` SET clause + matching params for a
// partial update, skipping any key not present in `data`. Internal helper
// only — not part of the module's public shape.
function buildUpdateSet(columns, data, startIndex) {
  const setParts = [];
  const params = [];
  let i = startIndex;
  for (const col of columns) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      setParts.push(`${col} = $${i}`);
      params.push(data[col]);
      i++;
    }
  }
  return { setParts, params };
}

// ─── cash_accounts ──────────────────────────────────────────────────────────

async function listCashAccounts(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM cash_accounts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getCashAccount(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM cash_accounts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createCashAccount(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO cash_accounts (user_id, label, institution, account_type, balance, currency, source, account_reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, data.label || 'Bank account', data.institution || null, data.account_type || 'transaction',
     Math.round(Number(data.balance) || 0), data.currency || 'AUD', data.source || 'manual', data.account_reference || null]
  );
  return rows[0];
}

async function updateCashAccount(id, userId, data) {
  const { setParts, params } = buildUpdateSet(
    ['label', 'institution', 'account_type', 'balance', 'currency', 'source', 'account_reference'], data, 3
  );
  if (!setParts.length) return getCashAccount(id, userId);
  const { rows } = await pool.query(
    `UPDATE cash_accounts SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteCashAccount(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM cash_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── investments ────────────────────────────────────────────────────────────

async function listInvestments(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM investments WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getInvestment(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM investments WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createInvestment(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO investments (user_id, name, kind, ticker, units, value, cost_basis, currency, source, account_reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [userId, data.name || 'Investment', data.kind || 'other', data.ticker || null,
     Number(data.units) || 0, Math.round(Number(data.value) || 0), Math.round(Number(data.cost_basis) || 0), data.currency || 'AUD',
     data.source || 'manual', data.account_reference || null]
  );
  return rows[0];
}

async function updateInvestment(id, userId, data) {
  const { setParts, params } = buildUpdateSet(
    ['name', 'kind', 'ticker', 'units', 'value', 'cost_basis', 'currency'], data, 3
  );
  if (!setParts.length) return getInvestment(id, userId);
  const { rows } = await pool.query(
    `UPDATE investments SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteInvestment(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM investments WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── properties ─────────────────────────────────────────────────────────────

async function listProperties(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM properties WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getProperty(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM properties WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createProperty(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO properties (user_id, label, address, property_type, value, mortgage_balance, rental_income, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, data.label || 'Property', data.address || null, data.property_type || 'residential',
     Math.round(Number(data.value) || 0), Math.round(Number(data.mortgage_balance) || 0), Math.round(Number(data.rental_income) || 0),
     data.source || 'manual']
  );
  return rows[0];
}

async function updateProperty(id, userId, data) {
  const { setParts, params } = buildUpdateSet(
    ['label', 'address', 'property_type', 'value', 'mortgage_balance', 'rental_income'], data, 3
  );
  if (!setParts.length) return getProperty(id, userId);
  const { rows } = await pool.query(
    `UPDATE properties SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteProperty(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM properties WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── debts ──────────────────────────────────────────────────────────────────

async function listDebts(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM debts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getDebt(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM debts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createDebt(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO debts (user_id, label, kind, balance, interest_rate, min_payment, source, account_reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, data.label || 'Debt', data.kind || 'other',
     Math.round(Number(data.balance) || 0), Number(data.interest_rate) || 0, Math.round(Number(data.min_payment) || 0),
     data.source || 'manual', data.account_reference || null]
  );
  return rows[0];
}

async function updateDebt(id, userId, data) {
  const { setParts, params } = buildUpdateSet(
    ['label', 'kind', 'balance', 'interest_rate', 'min_payment'], data, 3
  );
  if (!setParts.length) return getDebt(id, userId);
  const { rows } = await pool.query(
    `UPDATE debts SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteDebt(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM debts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── super_accounts ─────────────────────────────────────────────────────────

async function listSuperAccounts(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM super_accounts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getSuperAccount(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM super_accounts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createSuperAccount(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO super_accounts (user_id, label, fund_name, balance, employer_contrib, source, account_reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, data.label || 'Super account', data.fund_name || null,
     Math.round(Number(data.balance) || 0), Math.round(Number(data.employer_contrib) || 0),
     data.source || 'manual', data.account_reference || null]
  );
  return rows[0];
}

async function updateSuperAccount(id, userId, data) {
  const { setParts, params } = buildUpdateSet(
    ['label', 'fund_name', 'balance', 'employer_contrib'], data, 3
  );
  if (!setParts.length) return getSuperAccount(id, userId);
  const { rows } = await pool.query(
    `UPDATE super_accounts SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteSuperAccount(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM super_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── incomes ────────────────────────────────────────────────────────────────

async function listIncomes(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM incomes WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getIncome(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM incomes WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createIncome(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO incomes (user_id, label, kind, annual_amount)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, data.label || 'Primary income', data.kind || 'salary', Math.round(Number(data.annual_amount) || 0)]
  );
  return rows[0];
}

async function updateIncome(id, userId, data) {
  const { setParts, params } = buildUpdateSet(['label', 'kind', 'annual_amount'], data, 3);
  if (!setParts.length) return getIncome(id, userId);
  const { rows } = await pool.query(
    `UPDATE incomes SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteIncome(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM incomes WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── other_assets ───────────────────────────────────────────────────────────

async function listOtherAssets(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM other_assets WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getOtherAsset(id, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM other_assets WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function createOtherAsset(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO other_assets (user_id, label, kind, value)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, data.label || 'Other asset', data.kind || 'other', Math.round(Number(data.value) || 0)]
  );
  return rows[0];
}

async function updateOtherAsset(id, userId, data) {
  const { setParts, params } = buildUpdateSet(['label', 'kind', 'value'], data, 3);
  if (!setParts.length) return getOtherAsset(id, userId);
  const { rows } = await pool.query(
    `UPDATE other_assets SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...params]
  );
  return rows[0] || null;
}

async function deleteOtherAsset(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM other_assets WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows[0] || null;
}

// ─── Basiq sync support ─────────────────────────────────────────────────────

// Deletes all rows a given source previously wrote for this user, in one of
// the 4 tables a Basiq account can classify into (see lib/connected.js
// classifyAccountType). routes/basiq.js calls this before re-inserting the
// fresh account list on every sync — delete-then-recreate, same pattern
// already used for linked_accounts, rather than an upsert.
async function deleteAssetsBySource(table, userId, source) {
  const allowed = ['cash_accounts', 'investments', 'debts', 'super_accounts'];
  if (!allowed.includes(table)) throw new Error(`deleteAssetsBySource: unsupported table "${table}"`);
  await pool.query(`DELETE FROM ${table} WHERE user_id = $1 AND source = $2`, [userId, source]);
}

// ─── Aggregate summary ──────────────────────────────────────────────────────

// Pure function: sums raw rows from all 7 tables into total figures. No I/O —
// this is what test/assets-summary.test.js exercises directly with fixture
// arrays, per CLAUDE.md's "financial calculations need a deterministic test"
// rule. Postgres BIGINT/NUMERIC columns arrive as strings — always Number()
// before summing (documented gotcha, bit this codebase once already).
function summarizeAssets({ cashAccounts = [], investments = [], properties = [], debts = [], superAccounts = [], incomes = [], otherAssets = [] } = {}) {
  const sum = (rows, field) => rows.reduce((total, r) => total + (Number(r[field]) || 0), 0);
  return {
    cashTotal: sum(cashAccounts, 'balance'),
    investmentsTotal: sum(investments, 'value'),
    propertyTotal: sum(properties, 'value'),
    propertyMortgageTotal: sum(properties, 'mortgage_balance'),
    debtsTotal: sum(debts, 'balance'),
    superTotal: sum(superAccounts, 'balance'),
    incomeTotal: sum(incomes, 'annual_amount'),
    otherAssetsTotal: sum(otherAssets, 'value'),
  };
}

// Merges a flat user_profiles row with an asset summary into the shape
// computeMaalScore() (and other flat-column consumers) expect — WITHOUT
// dropping any existing user's data on the floor. Per-field fallback: a
// field only switches to the granular-table total once that table actually
// has rows for this user; until backfill runs (or the user starts using the
// new asset UI), each field keeps reading its flat column. This is what
// makes it safe to deploy the Phase 3 aggregation swap before Phase 4's
// backfill has actually run against production — without this, every
// existing user's score would crater to near-zero the moment this ships,
// since the new tables start out empty for everyone.
function mergeAssetSummaryIntoProfile(profile, assetSummary) {
  const p = profile || {};
  const s = assetSummary || {};
  return {
    ...p,
    cash_savings: s.cashTotal > 0 ? s.cashTotal : (Number(p.cash_savings) || 0),
    super_balance: s.superTotal > 0 ? s.superTotal : (Number(p.super_balance) || 0),
    investment_portfolio: s.investmentsTotal > 0 ? s.investmentsTotal : (Number(p.investment_portfolio) || 0),
    property_value: s.propertyTotal > 0 ? s.propertyTotal : (Number(p.property_value) || 0),
    total_debt: s.debtsTotal > 0 ? s.debtsTotal : (Number(p.total_debt) || 0),
    // Income was computed by summarizeAssets but never merged, so a user whose
    // income lives only in the `incomes` table scored as if they earned $0 —
    // which floors the savings, debt and trajectory pillars at once.
    annual_income: s.incomeTotal > 0 ? s.incomeTotal : (Number(p.annual_income) || 0),
    // hecs_balance intentionally untouched — stays a flat column, see the plan
  };
}

// Fetches all 7 tables for a user and summarizes them in one call. Thin
// wrapper around summarizeAssets() — keep new calculation logic in the pure
// function above, not here, so it stays testable without a DB.
async function getAssetSummary(userId) {
  const [cashAccounts, investments, properties, debts, superAccounts, incomes, otherAssets] = await Promise.all([
    listCashAccounts(userId),
    listInvestments(userId),
    listProperties(userId),
    listDebts(userId),
    listSuperAccounts(userId),
    listIncomes(userId),
    listOtherAssets(userId),
  ]);
  return summarizeAssets({ cashAccounts, investments, properties, debts, superAccounts, incomes, otherAssets });
}

module.exports = {
  listCashAccounts, getCashAccount, createCashAccount, updateCashAccount, deleteCashAccount,
  listInvestments, getInvestment, createInvestment, updateInvestment, deleteInvestment,
  listProperties, getProperty, createProperty, updateProperty, deleteProperty,
  listDebts, getDebt, createDebt, updateDebt, deleteDebt,
  listSuperAccounts, getSuperAccount, createSuperAccount, updateSuperAccount, deleteSuperAccount,
  listIncomes, getIncome, createIncome, updateIncome, deleteIncome,
  listOtherAssets, getOtherAsset, createOtherAsset, updateOtherAsset, deleteOtherAsset,
  deleteAssetsBySource,
  summarizeAssets, getAssetSummary, mergeAssetSummaryIntoProfile,
};
