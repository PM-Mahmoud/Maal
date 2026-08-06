'use strict';
const { normaliseMerchantIdentity } = require('./transaction-rules');
function dayGap(a, b) { return Math.abs(new Date(a) - new Date(b)) / 86400000; }
function relationshipMerchant(description) {
  return normaliseMerchantIdentity(String(description || '').replace(/\b(refund|reversal|reversed|void)\b/gi, ' '));
}
function detectTransactionRelationships(transactions, options = {}) {
  const tolerance = options.amountTolerance ?? 0.01;
  const rows = (transactions || []).filter((r) => r.id && r.post_date && Number(r.amount) !== 0)
    .sort((a, b) => new Date(a.post_date) - new Date(b.post_date) || Number(a.id) - Number(b.id));
  const used = new Set(); const relationships = [];
  for (let j = 1; j < rows.length; j++) for (let i = j - 1; i >= 0; i--) {
    const earlier = rows[i]; const later = rows[j];
    if (used.has(earlier.id) || used.has(later.id)) continue;
    const gap = dayGap(earlier.post_date, later.post_date); if (gap > 90) break;
    if (Number(earlier.amount) * Number(later.amount) >= 0
      || Math.abs(Math.abs(Number(earlier.amount)) - Math.abs(Number(later.amount))) > tolerance) continue;
    const text = `${earlier.description || ''} ${later.description || ''}`.toLowerCase();
    const differentAccounts = earlier.account_reference && later.account_reference
      && earlier.account_reference !== later.account_reference;
    const sameAccount = earlier.account_reference && later.account_reference
      && earlier.account_reference === later.account_reference;
    const sameMerchant = relationshipMerchant(earlier.description)
      && relationshipMerchant(earlier.description) === relationshipMerchant(later.description);
    let type = null;
    if (differentAccounts && /\b(credit card|card payment|cc payment|card repayment)\b/.test(text) && gap <= 3) type = 'card_repayment';
    else if (differentAccounts && /\b(transfer|tfr|osko|payid|to savings|from savings)\b/.test(text) && gap <= 3) type = 'internal_transfer';
    else if (sameAccount && sameMerchant && /\b(reversal|reversed|void)\b/.test(text) && gap <= 14) type = 'reversal';
    else if (sameAccount && sameMerchant && Number(later.amount) > 0 && gap <= 90) type = 'refund';
    if (!type) continue;
    used.add(earlier.id); used.add(later.id);
    relationships.push({ type, confidence: type === 'refund' && gap > 14 ? 0.8 : 0.95,
      transaction_ids: [earlier.id, later.id], days_apart: gap, amount: Math.abs(Number(later.amount)) });
    break;
  }
  return relationships;
}
function indexRelationships(items) { const map = new Map(); for (const x of items || []) for (const id of x.transaction_ids) map.set(String(id), x); return map; }
module.exports = { detectTransactionRelationships, indexRelationships };
