'use strict';
// lib/spending-categories.js — pure helpers for custom categories and category
// groups (Session 2 "Breakdown & budget", HEL-89 / HEL-90). No I/O: input
// validation, the colour/icon whitelists and the merge of custom categories
// into the taxonomy list that GET /v1/transaction-categories returns.
// Covered by test/spending-breakdown.test.js.

const { TAXONOMY, GROUPS } = require('./transaction-categories');

// Swatches offered by the "Pick a colour" grid. Muted so they sit with the v2
// monochrome UI; stored as hex so the client never needs a lookup.
const COLORS = Object.freeze([
  '#121313', '#4B4D4A', '#8A8C88', '#C9CAC6',
  '#2F5D50', '#3E7C6B', '#6C9A8B', '#A8C5B9',
  '#2C4A6B', '#4E6E94', '#8BA4C2', '#C3D1E2',
  '#7A4A2A', '#A86E45', '#C99A6E', '#E3C9AE',
  '#6B2F3A', '#9A4E5B', '#C48A94', '#5B4A7A',
]);

// Icon keys the client maps to lucide icons (client/src/components/maal/spending/breakdown/icons.ts).
const ICONS = Object.freeze([
  'tag', 'shopping-bag', 'shopping-cart', 'coffee', 'utensils', 'pizza', 'wine', 'beer',
  'car', 'bus', 'train', 'bike', 'fuel', 'plane', 'map', 'hotel',
  'home', 'sofa', 'wrench', 'zap', 'droplet', 'wifi', 'phone', 'tv',
  'heart', 'pill', 'dumbbell', 'stethoscope', 'baby', 'dog', 'cat', 'paw',
  'book', 'graduation-cap', 'music', 'film', 'gamepad', 'ticket', 'camera', 'palette',
  'gift', 'party', 'sun', 'umbrella', 'shirt', 'glasses', 'scissors', 'sparkles',
  'briefcase', 'laptop', 'piggy-bank', 'wallet', 'landmark', 'receipt', 'repeat', 'star',
]);

const KINDS = Object.freeze(['expense', 'income']);
const MAX_NAME = 40;

/** Trim + collapse inner whitespace. */
function cleanName(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/** Case-insensitive name clash against built-in groups and the user's names. */
function nameTaken(name, existingNames, ignoreName) {
  const n = name.toLowerCase();
  if (ignoreName && n === String(ignoreName).toLowerCase()) return false;
  if (GROUPS.some((g) => g.toLowerCase() === n)) return true;
  return (existingNames || []).some((e) => String(e).toLowerCase() === n);
}

/**
 * Validate a new/edited custom category.
 * existingNames = the user's other custom category names.
 * Returns { category: { name, kind, color, icon } } | { error }.
 * With `partial`, only the fields present are validated and returned.
 */
function validateCategoryInput(body, existingNames = [], { partial = false, currentName = null } = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const out = {};
  if (!partial || 'name' in b) {
    const name = cleanName(b.name);
    if (!name) return { error: 'Give the category a name.' };
    if (name.length > MAX_NAME) return { error: `Keep the name to ${MAX_NAME} characters or fewer.` };
    if (nameTaken(name, existingNames, currentName)) return { error: 'You already have a category with that name.' };
    out.name = name;
  }
  if (!partial || 'kind' in b) {
    const kind = b.kind == null && !partial ? 'expense' : b.kind;
    if (!KINDS.includes(kind)) return { error: 'Pick expense or income.' };
    out.kind = kind;
  }
  if (!partial || 'color' in b) {
    if (!COLORS.includes(b.color)) return { error: 'Pick a colour.' };
    out.color = b.color;
  }
  if (!partial || 'icon' in b) {
    if (!ICONS.includes(b.icon)) return { error: 'Pick an icon.' };
    out.icon = b.icon;
  }
  if (partial && !Object.keys(out).length) return { error: 'Nothing to update.' };
  return { category: out };
}

/**
 * Validate a category group. `knownCategories` = every category name the user
 * can put in a group (built-in groups + their custom categories).
 * existingNames = the user's other group names.
 */
function validateGroupInput(body, knownCategories, existingNames = [], { partial = false, currentName = null } = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const out = {};
  if (!partial || 'name' in b) {
    const name = cleanName(b.name);
    if (!name) return { error: 'Give the group a name.' };
    if (name.length > MAX_NAME) return { error: `Keep the name to ${MAX_NAME} characters or fewer.` };
    const n = name.toLowerCase();
    const clash = (existingNames || []).some((e) => String(e).toLowerCase() === n && n !== String(currentName || '').toLowerCase());
    if (clash) return { error: 'You already have a group with that name.' };
    out.name = name;
  }
  if (!partial || 'kind' in b) {
    const kind = b.kind == null && !partial ? 'expense' : b.kind;
    if (!KINDS.includes(kind)) return { error: 'Pick expense or income.' };
    out.kind = kind;
  }
  if (!partial || 'color' in b) {
    if (!COLORS.includes(b.color)) return { error: 'Pick a colour.' };
    out.color = b.color;
  }
  if (!partial || 'categories' in b) {
    const list = b.categories == null && !partial ? [] : b.categories;
    if (!Array.isArray(list)) return { error: 'Categories must be a list.' };
    const known = new Set(knownCategories || []);
    const bad = list.find((c) => !known.has(c));
    if (bad !== undefined) return { error: 'Unknown category.' };
    out.categories = [...new Set(list)];
  }
  if (partial && !Object.keys(out).length) return { error: 'Nothing to update.' };
  return { group: out };
}

/** Shape a custom category row for the client (BIGINT ids arrive as strings). */
function toCategory(row) {
  return { id: String(row.id), name: row.name, kind: row.kind, color: row.color, icon: row.icon };
}

/** Shape group rows + member rows into [{ id, name, kind, color, categories }]. */
function toGroups(groupRows, memberRows) {
  const by = new Map((groupRows || []).map((g) => [String(g.id), {
    id: String(g.id), name: g.name, kind: g.kind, color: g.color, categories: [],
  }]));
  for (const m of memberRows || []) {
    const g = by.get(String(m.group_id));
    if (g) g.categories.push(m.category_name);
  }
  for (const g of by.values()) g.categories.sort((a, b) => a.localeCompare(b));
  return [...by.values()];
}

/**
 * The picker list: the 18 built-in groups (with their sub-categories) followed
 * by the user's custom categories as extra top-level groups with no
 * sub-categories. Custom entries carry `custom: true` plus kind/colour/icon so
 * pickers can draw them; built-in entries keep the original shape.
 */
function mergeTaxonomy(customRows) {
  const builtIn = TAXONOMY.map((t) => ({ group: t.group, categories: t.categories }));
  const custom = (customRows || [])
    .map((c) => ({ group: c.name, categories: [], custom: true, id: String(c.id), kind: c.kind, color: c.color, icon: c.icon }))
    .sort((a, b) => a.group.localeCompare(b.group));
  return [...builtIn, ...custom];
}

/** Can `group` (+ optional `category`) be stored for a transaction? */
function isAssignableCategory(group, category, customNames) {
  if (GROUPS.includes(group)) return true; // built-ins are checked by isValidCategory
  return (customNames || []).includes(group) && (category == null || category === '');
}

module.exports = {
  COLORS, ICONS, KINDS, MAX_NAME,
  cleanName, nameTaken, validateCategoryInput, validateGroupInput,
  toCategory, toGroups, mergeTaxonomy, isAssignableCategory,
};
