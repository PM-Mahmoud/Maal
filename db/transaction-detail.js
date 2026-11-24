// db/transaction-detail.js — side tables behind Transaction detail & editing
// (redesign session 2, HEL-96..103; migration 1757000000000). The protected
// `transactions` table is only ever READ here. Every query filters by user_id
// in the SQL itself, and every write first proves the transaction belongs to
// the user (IDOR guard) — see db/advisor.js getMessages for the pattern.

const { pool } = require('./auth');

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Lock + return the user's transaction ({id, amount}) or null when not theirs. */
async function lockOwned(client, userId, transactionId) {
  const r = await client.query(
    'SELECT id, amount FROM transactions WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [transactionId, userId]
  );
  return r.rows[0] || null;
}

const mapMeta = (m) => ({
  hidden: !!(m && m.hidden),
  reviewed: !!(m && m.reviewed_at),
  reviewed_at: (m && m.reviewed_at) || null,
  note: (m && m.note) || null,
  merchant_name: (m && m.merchant_name) || null,
  description_override: (m && m.description) || null,
});
const mapSplit = (s) => ({
  id: String(s.id), position: s.position, amount: Number(s.amount),
  category_group: s.category_group, category: s.category || null, hidden: !!s.hidden,
});

/**
 * Meta, tags and splits for a set of the user's transactions, keyed by id.
 * Used to add the additive fields to GET /api/v1/transactions.
 */
async function getExtras(userId, ids) {
  const list = (ids || []).map(String);
  const empty = { meta: new Map(), tags: new Map(), splits: new Map() };
  if (!list.length) return empty;
  const [meta, tags, splits] = await Promise.all([
    pool.query(
      `SELECT transaction_id, hidden, reviewed_at, note, merchant_name, description
         FROM transaction_meta WHERE user_id = $1 AND transaction_id = ANY($2::bigint[])`,
      [userId, list]
    ),
    pool.query(
      `SELECT tt.transaction_id, g.id, g.name, g.color
         FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id AND g.user_id = $1
        WHERE tt.user_id = $1 AND tt.transaction_id = ANY($2::bigint[])
        ORDER BY lower(g.name)`,
      [userId, list]
    ),
    pool.query(
      `SELECT id, transaction_id, position, amount, category_group, category, hidden
         FROM transaction_splits WHERE user_id = $1 AND transaction_id = ANY($2::bigint[])
        ORDER BY transaction_id, position`,
      [userId, list]
    ),
  ]);
  for (const m of meta.rows) empty.meta.set(String(m.transaction_id), mapMeta(m));
  for (const t of tags.rows) {
    const k = String(t.transaction_id);
    empty.tags.set(k, [...(empty.tags.get(k) || []), { id: String(t.id), name: t.name, color: t.color }]);
  }
  for (const s of splits.rows) {
    const k = String(s.transaction_id);
    empty.splits.set(k, [...(empty.splits.get(k) || []), mapSplit(s)]);
  }
  return empty;
}

/** Merge the additive fields onto /transactions rows (no-op for rows without extras). */
function attachExtras(rows, extras) {
  return rows.map((r) => {
    const k = String(r.id);
    const m = extras.meta.get(k) || mapMeta(null);
    const out = { ...r, ...m, tags: extras.tags.get(k) || [], splits: extras.splits.get(k) || [] };
    // A renamed merchant shows wherever the UI reads `merchant || description`.
    if (m.merchant_name) out.merchant = m.merchant_name;
    return out;
  });
}

/**
 * Read spending categories, hidden flags and splits in one statement so a
 * bulk edit can't mix snapshots.
 */
async function loadSpendingDetails(userId, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const { rows: details } = await pool.query(
    `SELECT t.id AS transaction_id, c.category_group AS transaction_group,
            c.category AS transaction_category, m.hidden AS transaction_hidden,
            s.id, s.position, s.amount, s.category_group, s.category, s.hidden
       FROM transactions t
       LEFT JOIN transaction_categories c ON c.transaction_id = t.id AND c.user_id = $1
       LEFT JOIN transaction_meta m ON m.transaction_id = t.id AND m.user_id = $1
       LEFT JOIN transaction_splits s ON s.transaction_id = t.id AND s.user_id = $1
      WHERE t.user_id = $1 AND t.id = ANY($2::bigint[])
      ORDER BY t.id, s.position`,
    [userId, ids]
  );
  const byId = new Map();
  for (const detail of details) {
    const id = String(detail.transaction_id);
    if (!byId.has(id)) {
      byId.set(id, {
        category_group: detail.transaction_group ?? null,
        category: detail.transaction_category ?? null,
        hidden: !!detail.transaction_hidden,
        splits: [],
      });
    }
    if (detail.id != null) byId.get(id).splits.push(mapSplit(detail));
  }

  return rows.flatMap((row) => {
    const detail = byId.get(String(row.id));
    return detail ? [{ ...row, ...detail }] : [];
  });
}

async function getEffectiveTransactions(userId, rows) {
  const { effectiveTransactions } = await import('../shared/transaction-splits.mjs');
  return effectiveTransactions(await loadSpendingDetails(userId, rows));
}

/** Recurrence detection needs one dated payment per original bank movement. */
async function getEffectivePayments(userId, rows) {
  const annotated = await loadSpendingDetails(userId, rows);
  const { effectiveTransactions, toCents } = await import('../shared/transaction-splits.mjs');
  const effective = effectiveTransactions(annotated);
  const amountsById = new Map();
  for (const row of effective) {
    const id = String(row.split_of ?? row.id);
    amountsById.set(id, (amountsById.get(id) || 0) + toCents(row.amount));
  }
  return annotated.flatMap(({ hidden, splits, ...row }) => {
    const id = String(row.id);
    return amountsById.has(id) ? [{ ...row, amount: amountsById.get(id) / 100 }] : [];
  });
}

/** One transaction with category, account/institution, meta, tags and splits. */
async function getDetail(userId, transactionId) {
  const r = await pool.query(
    `SELECT t.id, t.description, t.amount, t.status, t.post_date,
            c.category_group, c.category, c.source AS category_source,
            pd.account_reference,
            la.institution_name
       FROM transactions t
       LEFT JOIN transaction_categories c ON c.transaction_id = t.id AND c.user_id = $2
       LEFT JOIN transaction_provider_details pd ON pd.transaction_id = t.id AND pd.user_id = $2
       LEFT JOIN LATERAL (
         SELECT institution_name FROM linked_accounts
          WHERE user_id = $2 AND account_reference = pd.account_reference
          LIMIT 1
       ) la ON TRUE
      WHERE t.id = $1 AND t.user_id = $2`,
    [transactionId, userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const extras = await getExtras(userId, [row.id]);
  return attachExtras([row], extras)[0];
}

/** Upsert meta fields for the user's transaction. Returns false when not theirs. */
async function updateMeta(userId, transactionId, patch) {
  return withTx(async (client) => {
    if (!(await lockOwned(client, userId, transactionId))) return false;
    await upsertMeta(client, userId, [String(transactionId)], patch);
    return true;
  });
}

// Shared by single + bulk edits; caller has already proven ownership of ids.
async function upsertMeta(client, userId, ids, patch) {
  const sets = [];
  const params = [userId, ids];
  const col = (name, value, expr) => { params.push(value); sets.push(`${name} = ${expr || `$${params.length}`}`); };
  if (patch.hidden !== undefined) col('hidden', patch.hidden);
  if (patch.reviewed !== undefined) {
    params.push(patch.reviewed);
    sets.push(`reviewed_at = CASE WHEN $${params.length}::boolean THEN COALESCE(transaction_meta.reviewed_at, NOW()) ELSE NULL END`);
  }
  if (patch.note !== undefined) col('note', patch.note);
  if (patch.merchant_name !== undefined) col('merchant_name', patch.merchant_name);
  if (patch.description !== undefined) col('description', patch.description);
  if (!sets.length) return;
  // Insert defaults first, then apply the patch as the conflict update so a
  // new row and an existing row go through the same SET list.
  await client.query(
    `INSERT INTO transaction_meta (transaction_id, user_id)
     SELECT t.id, $1 FROM transactions t WHERE t.id = ANY($2::bigint[]) AND t.user_id = $1
     ON CONFLICT (transaction_id) DO NOTHING`,
    [userId, ids]
  );
  await client.query(
    `UPDATE transaction_meta SET ${sets.join(', ')}, updated_at = NOW()
      WHERE user_id = $1 AND transaction_id = ANY($2::bigint[])`,
    params
  );
}

async function listTags(userId) {
  const r = await pool.query(
    `SELECT g.id, g.name, g.color,
            (SELECT COUNT(*)::int FROM transaction_tags tt WHERE tt.tag_id = g.id AND tt.user_id = $1) AS uses
       FROM tags g WHERE g.user_id = $1 ORDER BY lower(g.name)`,
    [userId]
  );
  return r.rows.map((t) => ({ id: String(t.id), name: t.name, color: t.color, uses: t.uses }));
}

/** Create a tag; returns { tag } or { conflict: true } when the name exists. */
async function createTag(userId, { name, color }) {
  const r = await pool.query(
    `INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, lower(name)) DO NOTHING
     RETURNING id, name, color`,
    [userId, name, color]
  );
  if (!r.rows[0]) return { conflict: true };
  const t = r.rows[0];
  return { tag: { id: String(t.id), name: t.name, color: t.color, uses: 0 } };
}

/** Update a tag owned by the user; uniqueness is enforced by the name index. */
async function updateTag(userId, tagId, { name, color }) {
  try {
    const result = await pool.query(
      `UPDATE tags AS g
          SET name = COALESCE($3, name), color = COALESCE($4, color)
        WHERE g.user_id = $1 AND g.id = $2
      RETURNING g.id, g.name, g.color,
        (SELECT COUNT(*)::int FROM transaction_tags tt WHERE tt.tag_id = g.id AND tt.user_id = $1) AS uses`,
      [userId, tagId, name ?? null, color ?? null]
    );
    const tag = result.rows[0];
    return tag ? { tag: { ...tag, id: String(tag.id) } } : null;
  } catch (error) {
    if (error.code === '23505') return { conflict: true };
    throw error;
  }
}

async function deleteTag(userId, tagId) {
  const r = await pool.query('DELETE FROM tags WHERE id = $1 AND user_id = $2', [tagId, userId]);
  return r.rowCount > 0;
}

/** Replace a transaction's tags. Returns false when the transaction isn't theirs. */
async function setTransactionTags(userId, transactionId, tagIds) {
  return withTx(async (client) => {
    if (!(await lockOwned(client, userId, transactionId))) return false;
    await applyTags(client, userId, [String(transactionId)], tagIds, true);
    return true;
  });
}

// Only the user's own tags are linked (the JOIN drops anyone else's ids).
async function applyTags(client, userId, ids, tagIds, replace) {
  if (replace) {
    await client.query(
      'DELETE FROM transaction_tags WHERE user_id = $1 AND transaction_id = ANY($2::bigint[])',
      [userId, ids]
    );
  }
  if (!tagIds.length) return;
  await client.query(
    `INSERT INTO transaction_tags (transaction_id, tag_id, user_id)
     SELECT t.id, g.id, $1
       FROM transactions t
       JOIN tags g ON g.id = ANY($3::bigint[]) AND g.user_id = $1
      WHERE t.id = ANY($2::bigint[]) AND t.user_id = $1
     ON CONFLICT DO NOTHING`,
    [userId, ids, tagIds]
  );
}

/**
 * Replace a transaction's split. `validate(amount)` (shared/transaction-splits
 * validateSplits bound by the route) runs INSIDE the transaction against the
 * locked row, so the stored parts always sum to the current amount.
 * Returns { notFound } | { error } | { splits }.
 */
async function replaceSplits(userId, transactionId, validate) {
  return withTx(async (client) => {
    const txn = await lockOwned(client, userId, transactionId);
    if (!txn) return { notFound: true };
    const v = validate(txn.amount);
    if (!v.ok) return { error: v.error, partErrors: v.partErrors };
    await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1 AND user_id = $2', [transactionId, userId]);
    const rows = [];
    for (let i = 0; i < v.parts.length; i++) {
      const p = v.parts[i];
      const r = await client.query(
        `INSERT INTO transaction_splits (transaction_id, user_id, position, amount, category_group, category, hidden)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, position, amount, category_group, category, hidden`,
        [transactionId, userId, i + 1, p.amount.toFixed(2), p.category_group, p.category, p.hidden]
      );
      rows.push(mapSplit(r.rows[0]));
    }
    return { splits: rows };
  });
}

async function clearSplits(userId, transactionId) {
  return withTx(async (client) => {
    if (!(await lockOwned(client, userId, transactionId))) return false;
    await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1 AND user_id = $2', [transactionId, userId]);
    return true;
  });
}

/**
 * Apply one set of changes to many of the user's transactions (the "Editing
 * transactions" drawer). Ids the user doesn't own are silently skipped; the
 * count of owned ids is returned.
 */
async function bulkEdit(userId, ids, changes) {
  return withTx(async (client) => {
    const owned = (await client.query(
      'SELECT id FROM transactions WHERE id = ANY($1::bigint[]) AND user_id = $2 FOR UPDATE',
      [ids, userId]
    )).rows.map((r) => String(r.id));
    if (!owned.length) return { updated: 0 };
    if (changes.category === null) {
      await client.query(
        'DELETE FROM transaction_categories WHERE user_id = $1 AND transaction_id = ANY($2::bigint[])',
        [userId, owned]
      );
    } else if (changes.category) {
      await client.query(
        `INSERT INTO transaction_categories (transaction_id, user_id, category_group, category, source, updated_at)
         SELECT t.id, $1, $3, $4, 'manual', NOW()
           FROM transactions t WHERE t.id = ANY($2::bigint[]) AND t.user_id = $1
         ON CONFLICT (transaction_id) DO UPDATE
           SET category_group = EXCLUDED.category_group, category = EXCLUDED.category,
               source = 'manual', updated_at = NOW()`,
        [userId, owned, changes.category.category_group, changes.category.category]
      );
    }
    await upsertMeta(client, userId, owned, changes);
    if (changes.add_tag_ids) await applyTags(client, userId, owned, changes.add_tag_ids, false);
    if (changes.set_tag_ids) await applyTags(client, userId, owned, changes.set_tag_ids, true);
    return { updated: owned.length };
  });
}

module.exports = {
  getExtras, attachExtras, getEffectiveTransactions, getEffectivePayments,
  getDetail, updateMeta, listTags, createTag, updateTag, deleteTag,
  setTransactionTags, replaceSplits, clearSplits, bulkEdit,
};
