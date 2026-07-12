// db/advisor-memory.js — synthesized cross-session advisor memory + the user's
// authored custom instructions. All queries scoped by user_id (IDOR rule).

const pool = require('./pool');
const { getProfileByUserId, upsertProfile } = require('./profiles');

// ─── Memory doc (inferred) ────────────────────────────────────────────────────

async function getMemory(userId) {
  const { rows } = await pool.query(
    `SELECT content, last_merged_at, updated_at FROM advisor_memory WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || { content: '', last_merged_at: null, updated_at: null };
}

async function saveMemory(userId, content) {
  await pool.query(
    `INSERT INTO advisor_memory (user_id, content, last_merged_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET content = EXCLUDED.content, last_merged_at = NOW(), updated_at = NOW()`,
    [userId, String(content || '').slice(0, 6000)]
  );
}

async function clearMemory(userId) {
  await pool.query(`DELETE FROM advisor_memory WHERE user_id = $1`, [userId]);
}

// ─── Custom instructions (authored) ───────────────────────────────────────────
// Stored in user_profiles.onboarding_data.custom_instructions so no new column
// is needed. Capped at 500 chars (matches the UI).

async function getCustomInstructions(userId) {
  const p = (await getProfileByUserId(userId)) || {};
  const od = (p.onboarding_data && typeof p.onboarding_data === 'object') ? p.onboarding_data : {};
  return String(od.custom_instructions || '');
}

async function setCustomInstructions(userId, text) {
  const current = (await getProfileByUserId(userId)) || {};
  const currentOd = (current.onboarding_data && typeof current.onboarding_data === 'object') ? current.onboarding_data : {};
  const value = String(text || '').slice(0, 500);
  // Merge over the FULL current row (like patchProfile) so upsertProfile doesn't
  // reset the profile's other columns to defaults.
  const merged = { ...current, onboarding_data: { ...currentOd, custom_instructions: value } };
  await upsertProfile(userId, merged);
  return value;
}

module.exports = { getMemory, saveMemory, clearMemory, getCustomInstructions, setCustomInstructions };
