'use strict';

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function accountReference(id) {
  return id === undefined || id === null || id === '' ? null : `lunchflow:${id}`;
}

function classifyAccount(account, balance = {}) {
  const value = `${account?.type || ''} ${account?.category || ''} ${account?.class || ''} ${account?.name || ''}`.toLowerCase();
  if (/super|pension|retirement/.test(value)) return 'super';
  if (/broker|investment|trading|securities|portfolio/.test(value)) return 'brokerage';
  if (/credit|loan|mortgage|liabilit/.test(value) || finiteNumber(balance.amount) < 0) return 'liability';
  if (/cash|saving|transaction|checking|current|deposit|offset|bank/.test(value)) return 'cash';
  return null;
}

function mapAccount(account, balance = {}) {
  if (!accountReference(account?.id)) return null;
  return {
    account_reference: accountReference(account.id),
    institution_name: String(account.institution_name || account.name || 'Bank account').slice(0, 200),
    institution_type: 'bank',
    account_type: classifyAccount(account, balance),
    label: String(account.name || account.institution_name || 'Bank account').slice(0, 200),
    balance: finiteNumber(balance.amount),
    currency: String(balance.currency || account.currency || 'AUD').slice(0, 3).toUpperCase(),
    status: String(account.status || 'active').toLowerCase(),
    observed_at: balance.as_of || balance.updated_at || account.updated_at || new Date().toISOString(),
  };
}

function mapTransaction(transaction) {
  if (!transaction?.id) return null;
  const merchant = String(transaction.merchant || '').trim();
  const detail = String(transaction.description || '').trim();
  return {
    provider_id: `lunchflow:${transaction.id}`,
    account_reference: accountReference(transaction.accountId),
    amount: finiteNumber(transaction.amount),
    post_date: transaction.date ? String(transaction.date).slice(0, 10) : null,
    description: (merchant && detail && merchant !== detail
      ? `${merchant} — ${detail}`
      : merchant || detail).slice(0, 500),
    status: transaction.isPending ? 'pending' : 'posted',
  };
}

module.exports = { accountReference, classifyAccount, mapAccount, mapTransaction };
