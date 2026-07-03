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

// Classifies a mapped Basiq account (output of mapBasiqAccount above) into
// one of the 4 asset/liability buckets and shapes its insert payload for
// that table — pure, no DB. routes/basiq.js dispatches on `bucket` to call
// the right db/assets.js create function. `classifyFn` is injected (rather
// than imported directly) to keep this module dependency-free, matching the
// rest of this file's no-I/O contract — routes/basiq.js passes
// lib/connected.js's classifyAccountType.
function shapeBasiqAssetRow(mappedAccount, classifyFn) {
  const bucket = classifyFn(mappedAccount.institution_type, mappedAccount.balance);
  const common = { source: 'basiq', account_reference: mappedAccount.account_reference };
  const shapes = {
    cash: { table: 'cash_accounts', row: { ...common, label: mappedAccount.institution_name, institution: mappedAccount.institution_name, balance: mappedAccount.balance } },
    invest: { table: 'investments', row: { ...common, name: mappedAccount.institution_name, kind: 'other', value: mappedAccount.balance } },
    super: { table: 'super_accounts', row: { ...common, label: mappedAccount.institution_name, fund_name: mappedAccount.institution_name, balance: mappedAccount.balance } },
    debt: { table: 'debts', row: { ...common, label: mappedAccount.institution_name, kind: 'other', balance: Math.abs(mappedAccount.balance) } },
  };
  return { bucket, ...shapes[bucket] };
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

module.exports = { mapBasiqAccount, shapeBasiqAssetRow, mapBasiqTransaction };
