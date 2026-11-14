const { isValidNumber, parsePostingDate } = require('./data-quality');
const { isKnownGroup } = require('./transaction-categories');

// The client (manual add + CSV import) posts a legacy simple `category` string
// (see CATS in client/src/routes/_authenticated/app.transactions.tsx). Categories
// are NOT a column on the protected `transactions` table — they live in the
// separate `transaction_categories` FK table. This map turns the client's simple
// value into the 18-group taxonomy's { group, category } so a user's explicit
// choice can be persisted with source='manual'. "other"/unknown/absent resolve to
// null so auto-categorisation still drives the display (important for CSV import,
// which always sends "other" — it has no category column to read from).
const CLIENT_CATEGORY_MAP = {
  groceries: { group: 'Food & Dining', category: 'Groceries' },
  dining: { group: 'Food & Dining', category: 'Restaurants' },
  transport: { group: 'Auto & Transport', category: null },
  housing: { group: 'Housing', category: null },
  utilities: { group: 'Bills & Utilities', category: null },
  health: { group: 'Health & Wellness', category: null },
  income: { group: 'Income', category: null },
  investing: { group: 'Savings & Investments', category: 'Investment' },
  savings: { group: 'Savings & Investments', category: null },
  entertainment: { group: 'Travel & Lifestyle', category: 'Entertainment' },
};

// Pure: resolve the client's simple category string to a taxonomy assignment, or
// null when there's no meaningful manual choice to persist. Validates the mapped
// group against the taxonomy so a stale client value can never write garbage.
function resolveClientCategory(category) {
  if (category == null) return null;
  const key = String(category).trim().toLowerCase();
  if (!key || key === 'other' || key === 'uncategorised' || key === 'uncategorized') return null;
  const mapped = CLIENT_CATEGORY_MAP[key];
  if (!mapped || !isKnownGroup(mapped.group)) return null;
  return { category_group: mapped.group, category: mapped.category };
}

function normalizeImportedTransaction(input) {
  const row = input && typeof input === 'object' ? input : {};
  const postDate = row.post_date || row.occurred_on;
  if (!parsePostingDate(postDate)) throw new Error('Transaction date must be a valid YYYY-MM-DD date');
  if (!isValidNumber(row.amount)) throw new Error('Transaction amount is missing or invalid');
  const description = String(row.description || '').trim();
  if (!description) throw new Error('Transaction description is required');
  return {
    description: description.slice(0, 500),
    amount: Number(row.amount),
    status: row.status ? String(row.status).slice(0, 40) : null,
    post_date: postDate,
  };
}

module.exports = { normalizeImportedTransaction, resolveClientCategory };
