// db/roadmap.js
// Product roadmap items + one up/down vote per user per item.

const { pool } = require('./auth');

// Items with vote totals and the current user's vote, hottest first.
async function listItems(userId) {
  const result = await pool.query(
    `SELECT i.id, i.title, i.details, i.status, i.created_at,
            COALESCE(SUM(v.vote), 0)::int AS score,
            COUNT(v.vote) FILTER (WHERE v.vote = 1)::int AS upvotes,
            COUNT(v.vote) FILTER (WHERE v.vote = -1)::int AS downvotes,
            MAX(CASE WHEN v.user_id = $1 THEN v.vote END)::int AS my_vote
     FROM roadmap_items i
     LEFT JOIN roadmap_votes v ON v.item_id = i.id
     GROUP BY i.id
     ORDER BY COALESCE(SUM(v.vote), 0) DESC, i.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function addItem(userId, title, details) {
  const result = await pool.query(
    `INSERT INTO roadmap_items (user_id, title, details) VALUES ($1, $2, $3) RETURNING id`,
    [userId, title, details || null]
  );
  return result.rows[0].id;
}

// Same vote again removes it (toggle); a different vote replaces it.
async function castVote(itemId, userId, vote) {
  const existing = await pool.query(
    `SELECT vote FROM roadmap_votes WHERE item_id = $1 AND user_id = $2`,
    [itemId, userId]
  );
  if (existing.rows.length && existing.rows[0].vote === vote) {
    await pool.query(`DELETE FROM roadmap_votes WHERE item_id = $1 AND user_id = $2`, [itemId, userId]);
    return null;
  }
  await pool.query(
    `INSERT INTO roadmap_votes (item_id, user_id, vote) VALUES ($1, $2, $3)
     ON CONFLICT (item_id, user_id) DO UPDATE SET vote = $3`,
    [itemId, userId, vote]
  );
  return vote;
}

module.exports = { listItems, addItem, castVote };
