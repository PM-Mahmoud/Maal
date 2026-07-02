// lib/basiq-mapping.js
// Pure data-mapping functions for the Basiq sync flow — no I/O, no DB, no network.
// Extracted from routes/basiq.js and db/transactions.js so the mapping contract
// (see specs/basiq-sync.md) is unit-testable without hitting Basiq or Postgres.
// Behaviour here must match specs/basiq-sync.md exactly.

function mapBasiqAccount(acc) {
  return {
    institution_name: (acc.institution && acc.institution.replace('AU', '')) || acc.name || 'Bank account',
    institution_type: acc.class && acc.class.type ? acc.class.type : 'bank',
    account_reference: 'basiq:' + acc.id,
    balance: Math.round(Number(acc.balance) || 0),
  };
}

function mapBasiqTransaction(t) {
  if (!t || !t.id) return null;
  const postDate = (t.postDate || t.transactionDate || '').slice(0, 10) || null;
  return {
    basiq_id: t.id,
    description: (t.description || (t.subClass && t.subClass.title) || '').slice(0, 500),
    amount: Number(t.amount) || 0,
    status: t.status || null,
    post_date: postDate,
  };
}

module.exports = { mapBasiqAccount, mapBasiqTransaction };
