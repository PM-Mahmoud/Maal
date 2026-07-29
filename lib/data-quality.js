const crypto = require('crypto');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
  }
  return value;
}

function payloadHash(payload) {
  const serialized = JSON.stringify(stableValue(payload)) ?? 'null';
  return crypto
    .createHash('sha256')
    .update(serialized)
    .digest('hex');
}

function isValidNumber(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

function parsePostingDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return parsed;
}

function finding(check_code, entity_type, entity_key, severity, summary, details = {}) {
  return { check_code, entity_type, entity_key: String(entity_key || ''), severity, summary, details };
}

function checkTransactions(transactions, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const findings = [];
  const externalIds = new Map();

  for (const transaction of transactions || []) {
    const key = transaction.id || transaction.basiq_id || '';
    if (transaction.source === 'basiq' && !transaction.basiq_id) {
      findings.push(finding(
        'transaction.missing_reference', 'transaction', key, 'error',
        'Imported transaction has no provider identifier.'
      ));
    }
    if (!isValidNumber(transaction.amount)) {
      findings.push(finding(
        'transaction.invalid_amount', 'transaction', key, 'error',
        'Transaction has a missing or invalid amount.',
        { value: transaction.amount ?? null }
      ));
    }

    const postingDate = parsePostingDate(transaction.post_date);
    if (!postingDate) {
      findings.push(finding(
        'transaction.invalid_date', 'transaction', key, 'error',
        'Transaction has a missing or invalid posting date.'
      ));
    } else if (postingDate > now) {
      findings.push(finding(
        'transaction.future_date', 'transaction', key, 'warning',
        'Transaction posting date is in the future.',
        { post_date: transaction.post_date }
      ));
    }

    if (transaction.basiq_id) {
      const prior = externalIds.get(transaction.basiq_id);
      if (prior) {
        findings.push(finding(
          'transaction.duplicate_external_id', 'transaction', transaction.basiq_id, 'error',
          'Multiple transactions share the same provider identifier.',
          { transaction_ids: [prior, transaction.id].filter(Boolean) }
        ));
      } else {
        externalIds.set(transaction.basiq_id, transaction.id);
      }
    }
  }
  return findings;
}

function checkAccounts(accounts, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const staleAfterDays = options.staleAfterDays || 7;
  const staleBefore = new Date(now.getTime() - staleAfterDays * 86400000);
  const findings = [];
  const references = new Map();

  for (const account of accounts || []) {
    const key = account.id || account.account_reference || account.label || '';
    if ((account.source === 'connected' || account.source === 'basiq') && !account.account_reference) {
      findings.push(finding(
        'account.missing_reference', 'account', key, 'error',
        'Connected account has no provider reference.'
      ));
    }
    if (!isValidNumber(account.balance)) {
      findings.push(finding(
        'account.invalid_balance', 'account', key, 'error',
        'Account has a missing or invalid balance.',
        { value: account.balance ?? null }
      ));
    }

    if (account.source === 'connected' || account.source === 'basiq') {
      const updatedAt = account.updated_at && new Date(account.updated_at);
      if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
        findings.push(finding(
          'account.missing_freshness', 'account', key, 'warning',
          'Connected account has no valid source timestamp.'
        ));
      } else if (updatedAt < staleBefore) {
        findings.push(finding(
          'account.stale', 'account', key, 'warning',
          'Connected account data is stale.',
          { updated_at: account.updated_at, stale_after_days: staleAfterDays }
        ));
      }
    }

    if (account.account_reference) {
      const prior = references.get(account.account_reference);
      if (prior) {
        findings.push(finding(
          'account.duplicate_reference', 'account', account.account_reference, 'error',
          'Multiple accounts share the same provider reference.',
          { account_ids: [prior, account.id].filter(Boolean) }
        ));
      } else {
        references.set(account.account_reference, account.id);
      }
    }
  }
  return findings;
}

module.exports = { payloadHash, isValidNumber, parsePostingDate, checkTransactions, checkAccounts };
