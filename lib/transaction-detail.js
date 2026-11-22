// lib/transaction-detail.js — pure input validation for the Transaction detail
// & editing endpoints (redesign session 2, HEL-96..103). No I/O. Tested in
// test/transaction-splits.test.js. Split money maths lives in
// shared/transaction-splits.mjs.

const { isKnownGroup, isValidCategory } = require('./transaction-categories');

// Tag colour keys (the client maps each to a muted swatch, light + dark).
const TAG_COLORS = Object.freeze(['sand', 'sage', 'sky', 'lilac', 'rose', 'clay', 'slate', 'teal', 'olive', 'plum', 'gold', 'stone']);
const MAX_BULK_IDS = 200;

const clean = (v, max) => {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? { error: `Keep it to ${max} characters.` } : s;
};

/** A positive integer id (BIGINT-safe string) or null. */
function toId(v) {
  const s = String(v ?? '').trim();
  return /^[1-9]\d{0,17}$/.test(s) ? s : null;
}

/**
 * Validate a PATCH /transactions/:id/meta body. Returns { patch } or { error }.
 * Fields: hidden (bool), reviewed (bool), note, merchant_name, description
 * (strings; empty/null clears back to the bank's value).
 */
function validateMetaPatch(body) {
  const b = body && typeof body === 'object' ? body : {};
  const patch = {};
  for (const k of ['hidden', 'reviewed']) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== 'boolean') return { error: `${k} must be true or false.` };
    patch[k] = b[k];
  }
  const limits = { note: 500, merchant_name: 120, description: 240 };
  for (const [k, max] of Object.entries(limits)) {
    if (b[k] === undefined) continue;
    const v = clean(b[k], max);
    if (v === undefined) return { error: `${k} must be text.` };
    if (v && typeof v === 'object') return { error: v.error };
    patch[k] = v;
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to update.' };
  return { patch };
}

/** Validate a new tag { name, color }. */
function validateTag(body) {
  const name = clean(body && body.name, 40);
  if (!name || typeof name !== 'string') return { error: name && name.error ? name.error : 'Give the tag a name.' };
  const color = body && body.color ? String(body.color) : 'sand';
  if (!TAG_COLORS.includes(color)) return { error: 'Pick one of the colours.' };
  return { tag: { name, color } };
}

/** Validate a list of tag ids (dedupes). */
function validateTagIds(v) {
  if (!Array.isArray(v)) return { error: 'tag_ids must be a list.' };
  if (v.length > 50) return { error: 'Too many tags.' };
  const ids = [];
  for (const x of v) {
    const id = toId(x);
    if (!id) return { error: 'Unknown tag.' };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids };
}

/**
 * Validate a POST /transactions/bulk-edit body:
 * { ids: [..], changes: { category?: {category_group, category}|null,
 *   hidden?, reviewed?, merchant_name?, description?, add_tag_ids?, set_tag_ids? } }
 * `category: null` clears a stored category (back to automatic).
 */
function validateBulkEdit(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!Array.isArray(b.ids) || !b.ids.length) return { error: 'Choose at least one transaction.' };
  if (b.ids.length > MAX_BULK_IDS) return { error: `Edit at most ${MAX_BULK_IDS} transactions at once.` };
  const ids = [];
  for (const x of b.ids) {
    const id = toId(x);
    if (!id) return { error: 'Unknown transaction.' };
    if (!ids.includes(id)) ids.push(id);
  }
  const c = b.changes && typeof b.changes === 'object' ? b.changes : {};
  const changes = {};
  if (c.category !== undefined) {
    if (c.category === null) changes.category = null;
    else {
      const g = c.category && c.category.category_group;
      const sub = (c.category && c.category.category) || null;
      if (!isKnownGroup(g)) return { error: 'Unknown category group.' };
      if (!isValidCategory(g, sub)) return { error: 'Unknown category.' };
      changes.category = { category_group: g, category: sub };
    }
  }
  const metaKeys = ['hidden', 'reviewed', 'merchant_name', 'description'];
  const metaBody = {};
  for (const k of metaKeys) if (c[k] !== undefined) metaBody[k] = c[k];
  if (Object.keys(metaBody).length) {
    const m = validateMetaPatch(metaBody);
    if (m.error) return { error: m.error };
    Object.assign(changes, m.patch);
  }
  for (const k of ['add_tag_ids', 'set_tag_ids']) {
    if (c[k] === undefined) continue;
    const t = validateTagIds(c[k]);
    if (t.error) return { error: t.error };
    changes[k] = t.ids;
  }
  if (changes.add_tag_ids && changes.set_tag_ids) return { error: 'Use either add_tag_ids or set_tag_ids.' };
  if (!Object.keys(changes).length) return { error: 'Nothing to change.' };
  return { ids, changes };
}

module.exports = { TAG_COLORS, MAX_BULK_IDS, toId, validateMetaPatch, validateTag, validateTagIds, validateBulkEdit };
