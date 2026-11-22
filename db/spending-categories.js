'use strict';
// db/spending-categories.js — custom categories + category groups (migration
// 1756900000000). Every statement filters by user_id in SQL (no RLS here: a
// missing user filter would be an IDOR bug). Renames and deletes also update
// the user's own rows in budgets, transaction_categories (side table, FK to
// transactions — the protected transactions table is never touched) and group
// memberships, inside one transaction.

const pool = require('./pool');

async function listCustomCategories(userId) {
  const r = await pool.query(
    `SELECT id, name, kind, color, icon FROM spending_custom_categories
      WHERE user_id = $1 ORDER BY lower(name)`,
    [userId]
  );
  return r.rows;
}

async function customCategoryNames(userId) {
  return (await listCustomCategories(userId)).map((r) => r.name);
}

async function getCustomCategory(id, userId) {
  const r = await pool.query(
    `SELECT id, name, kind, color, icon FROM spending_custom_categories WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return r.rows[0] || null;
}

async function createCustomCategory(userId, { name, kind, color, icon }) {
  const r = await pool.query(
    `INSERT INTO spending_custom_categories (user_id, name, kind, color, icon)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, kind, color, icon`,
    [userId, name, kind, color, icon]
  );
  return r.rows[0];
}

/** Update a custom category; a rename carries through to the user's budgets, categorised transactions and group memberships. */
async function updateCustomCategory(id, userId, patch) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT id, name FROM spending_custom_categories WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId]
    );
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return null; }
    const oldName = cur.rows[0].name;
    const r = await client.query(
      `UPDATE spending_custom_categories
          SET name = COALESCE($3, name), kind = COALESCE($4, kind), color = COALESCE($5, color),
              icon = COALESCE($6, icon), updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, kind, color, icon`,
      [id, userId, patch.name ?? null, patch.kind ?? null, patch.color ?? null, patch.icon ?? null]
    );
    const row = r.rows[0];
    if (patch.name && patch.name !== oldName) {
      await client.query(`UPDATE budgets SET category_group = $3, updated_at = NOW() WHERE user_id = $1 AND category_group = $2`, [userId, oldName, row.name]);
      await client.query(`UPDATE transaction_categories SET category_group = $3, updated_at = NOW() WHERE user_id = $1 AND category_group = $2`, [userId, oldName, row.name]);
      await client.query(`UPDATE spending_category_group_members SET category_name = $3 WHERE user_id = $1 AND category_name = $2`, [userId, oldName, row.name]);
    }
    await client.query('COMMIT');
    return row;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Delete a custom category. Its budget and group membership go with it, and
 * transactions filed under it lose that stored category (they fall back to
 * auto-categorisation). Returns false when it isn't the user's.
 */
async function deleteCustomCategory(id, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM spending_custom_categories WHERE id = $1 AND user_id = $2 RETURNING name`,
      [id, userId]
    );
    if (!del.rows[0]) { await client.query('ROLLBACK'); return false; }
    const name = del.rows[0].name;
    await client.query(`DELETE FROM budgets WHERE user_id = $1 AND category_group = $2`, [userId, name]);
    await client.query(`DELETE FROM transaction_categories WHERE user_id = $1 AND category_group = $2`, [userId, name]);
    await client.query(`DELETE FROM spending_category_group_members WHERE user_id = $1 AND category_name = $2`, [userId, name]);
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function listGroups(userId) {
  const [g, m] = await Promise.all([
    pool.query(`SELECT id, name, kind, color FROM spending_category_groups WHERE user_id = $1 ORDER BY lower(name)`, [userId]),
    pool.query(`SELECT group_id, category_name FROM spending_category_group_members WHERE user_id = $1`, [userId]),
  ]);
  return { groups: g.rows, members: m.rows };
}

/** Put `categories` in group `groupId`, moving them out of any other group of the user's. */
async function setMembers(client, userId, groupId, categories) {
  await client.query(`DELETE FROM spending_category_group_members WHERE user_id = $1 AND group_id = $2`, [userId, groupId]);
  if (!categories.length) return;
  await client.query(`DELETE FROM spending_category_group_members WHERE user_id = $1 AND category_name = ANY($2::text[])`, [userId, categories]);
  await client.query(
    `INSERT INTO spending_category_group_members (group_id, user_id, category_name)
     SELECT $1, $2, unnest($3::text[])`,
    [groupId, userId, categories]
  );
}

async function createGroup(userId, { name, kind, color, categories }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO spending_category_groups (user_id, name, kind, color) VALUES ($1, $2, $3, $4)
       RETURNING id, name, kind, color`,
      [userId, name, kind, color]
    );
    await setMembers(client, userId, r.rows[0].id, categories || []);
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function updateGroup(id, userId, patch) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE spending_category_groups
          SET name = COALESCE($3, name), kind = COALESCE($4, kind), color = COALESCE($5, color), updated_at = NOW()
        WHERE id = $1 AND user_id = $2 RETURNING id, name, kind, color`,
      [id, userId, patch.name ?? null, patch.kind ?? null, patch.color ?? null]
    );
    if (!r.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (Array.isArray(patch.categories)) await setMembers(client, userId, id, patch.categories);
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function deleteGroup(id, userId) {
  const r = await pool.query(`DELETE FROM spending_category_groups WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount > 0;
}

module.exports = {
  listCustomCategories, customCategoryNames, getCustomCategory, createCustomCategory,
  updateCustomCategory, deleteCustomCategory, listGroups, createGroup, updateGroup, deleteGroup,
};
