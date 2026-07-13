// db/goals.js — source-linked live goals (PR 7).
//
// A goal stores its target and (for source-linked goals) a `source_type`
// pointing at one aggregate of the user's live position. Progress is DERIVED at
// read time from live financials via lib/goal-progress, not stored as a stale
// number. See migration 1752700000000_goals_live_source.js for the columns.

const { pool } = require('./auth');
const assetsDb = require('./assets');
const { getProfileByUserId } = require('./profiles');
const { snapshotValuesFromProfile } = require('./snapshots');
const { deriveGoalProgress, defaultSourceForCategory } = require('../lib/goal-progress');

const SOURCE_TYPES = new Set(['manual', 'net_worth', 'cash', 'super', 'investments', 'debts']);
const TARGET_KINDS = new Set(['amount', 'percent']);

// The live { netWorth, cash, super, investments, debts } for a user, computed
// exactly like the dashboard/snapshots so a goal and the net-worth tiles agree.
async function getLiveFinancials(userId) {
  const profile = (await getProfileByUserId(userId)) || {};
  const assetSummary = await assetsDb.getAssetSummary(userId);
  const effective = assetsDb.mergeAssetSummaryIntoProfile(profile, assetSummary);
  return snapshotValuesFromProfile(effective);
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function sourceMapKey(sourceType) {
  return { net_worth: 'netWorth', cash: 'cash', super: 'super', investments: 'investments', debts: 'debts' }[sourceType] || 'netWorth';
}

// Normalise a create/update payload into stored columns. `financials` is used to
// snapshot the baseline for a source-linked goal so pay-off progress and percent
// targets have a fixed reference point.
function normalize(body, financials, { isCreate, existing } = {}) {
  const b = body || {};
  const fin = financials || {};
  const category = b.category != null ? String(b.category) : (existing && existing.category) || null;

  let sourceType = b.source_type != null ? String(b.source_type) : (existing && existing.source_type);
  if (sourceType == null && isCreate) sourceType = defaultSourceForCategory(category);
  if (!SOURCE_TYPES.has(sourceType)) sourceType = 'manual';

  let targetKind = b.target_kind != null ? String(b.target_kind) : (existing && existing.target_kind) || 'amount';
  if (!TARGET_KINDS.has(targetKind)) targetKind = 'amount';

  const out = {
    source_type: sourceType,
    target_kind: targetKind,
    target_pct: b.target_pct != null ? Math.max(0, num(b.target_pct)) : (existing ? existing.target_pct : null),
    target_amount: b.target_amount != null ? Math.max(0, num(b.target_amount)) : (existing ? num(existing.target_amount) : 0),
    target_date: b.target_date != null ? (b.target_date || null) : (existing ? existing.target_date : null),
    description: b.description != null ? (b.description || null) : (existing ? existing.description : null),
    name: b.name != null ? String(b.name).slice(0, 200) : (existing && existing.name) || 'Goal',
    category,
  };

  // baseline: the source value at creation. Only (re)captured on create or when
  // the source changes, so ongoing progress stays anchored.
  const sourceChanged = existing && existing.source_type !== sourceType;
  if (isCreate || sourceChanged) {
    out.baseline_amount = sourceType === 'manual' ? 0 : num(fin[sourceMapKey(sourceType)]);
  } else {
    out.baseline_amount = existing ? num(existing.baseline_amount) : 0;
  }

  // current_amount is only a stored value for MANUAL goals; source-linked goals
  // derive it, so we ignore any client-sent current_amount for them.
  out.current_amount = sourceType === 'manual'
    ? Math.max(0, num(b.current_amount != null ? b.current_amount : (existing ? existing.current_amount : 0)))
    : 0;

  return out;
}

// Attach derived progress to a stored goal row.
function withProgress(row, financials) {
  const derived = deriveGoalProgress(row, financials);
  const autoTracked = Boolean(row.source_type && row.source_type !== 'manual');
  return {
    ...row,
    target_amount: derived.target_amount,
    current_amount: derived.current_amount,
    progress_pct: derived.pct,
    reached: derived.reached,
    auto_tracked: autoTracked,
    // Legacy aliases for the EJS dashboard-goals view (target/current/type).
    target: derived.target_amount,
    current: derived.current_amount,
    type: row.category || 'Save',
  };
}

async function listGoals(userId) {
  const financials = await getLiveFinancials(userId).catch(() => ({}));
  const r = await pool.query(
    `SELECT id, name, category, description, source_type, target_kind, target_pct,
            target_amount, current_amount, baseline_amount, target_date, created_at
       FROM goals WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows.map((row) => withProgress(row, financials));
}

async function getGoal(id, userId) {
  const r = await pool.query(`SELECT * FROM goals WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rows[0] || null;
}

async function createGoal(userId, body) {
  const financials = await getLiveFinancials(userId).catch(() => ({}));
  const g = normalize(body, financials, { isCreate: true });
  const r = await pool.query(
    `INSERT INTO goals
       (user_id, name, category, description, source_type, target_kind, target_pct,
        target_amount, current_amount, baseline_amount, target_date,
        type, target, current)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [userId, g.name, g.category, g.description, g.source_type, g.target_kind, g.target_pct,
     g.target_amount, g.current_amount, g.baseline_amount, g.target_date,
     // keep legacy columns populated for backward compat with any old reader
     g.category || 'Save', g.target_amount, g.current_amount]
  );
  return withProgress(r.rows[0], financials);
}

async function updateGoal(id, userId, body) {
  const existing = await getGoal(id, userId);
  if (!existing) return null;
  const financials = await getLiveFinancials(userId).catch(() => ({}));
  const g = normalize(body, financials, { isCreate: false, existing });
  const r = await pool.query(
    `UPDATE goals SET name=$3, category=$4, description=$5, source_type=$6, target_kind=$7,
            target_pct=$8, target_amount=$9, current_amount=$10, baseline_amount=$11,
            target_date=$12, target=$9, current=$10, updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
    [id, userId, g.name, g.category, g.description, g.source_type, g.target_kind,
     g.target_pct, g.target_amount, g.current_amount, g.baseline_amount, g.target_date]
  );
  return r.rows[0] ? withProgress(r.rows[0], financials) : null;
}

// Manual-goal progress bump (kept for the legacy /dashboard EJS route).
async function updateGoalProgress(id, userId, current) {
  await pool.query(
    `UPDATE goals SET current_amount = $3, current = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND source_type = 'manual'`,
    [id, userId, Math.max(0, num(current))]
  );
}

async function deleteGoal(id, userId) {
  await pool.query(`DELETE FROM goals WHERE id = $1 AND user_id = $2`, [id, userId]);
}

module.exports = {
  listGoals, getGoal, createGoal, updateGoal, updateGoalProgress, deleteGoal,
  getLiveFinancials, SOURCE_TYPES,
};
