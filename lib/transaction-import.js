const { isValidNumber, parsePostingDate } = require('./data-quality');
const { toId } = require('./transaction-detail');

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

function normalizeManualCashAccountId(value) {
  if (value == null) return null;
  const validType = typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value));
  const id = validType ? toId(value) : null;
  if (!id) throw new Error('Choose a valid cash account.');
  return id;
}

module.exports = { normalizeImportedTransaction, normalizeManualCashAccountId };
