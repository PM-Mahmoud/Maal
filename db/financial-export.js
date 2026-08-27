const pool = require('./pool');
const DIRECT_TABLES = [
  'user_profiles','cash_accounts','investments','properties','debts','super_accounts','incomes','other_assets',
  'linked_accounts','transactions','goals','account_reconciliations','account_reconciliation_adjustments',
  'net_worth_snapshots','monthly_financial_closes','radars','research_reports',
  'financial_scores','maal_score_snapshots','recommendations','raw_financial_records','calculation_audits',
  'calculation_audit_sources','data_quality_findings','data_quality_runs','import_runs',
  'provider_connection_health','transaction_sync_cursors','transaction_category_feedback','background_jobs',
  'financial_accounts','instruments','holdings','valuations','ownership_interests','canonical_account_links',
  'provider_connection_events',
];
async function loadFinancialExport(userId) {
  const data = {};
  for (const table of DIRECT_TABLES) {
    data[table] = (await pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId])).rows;
  }
  data.users = (await pool.query(`SELECT id,email,name,plan,created_at FROM users WHERE id=$1`, [userId])).rows;
  data.radar_events = (await pool.query(`SELECT e.* FROM radar_events e JOIN radars r ON r.id=e.radar_id WHERE r.user_id=$1 ORDER BY e.id`, [userId])).rows;
  data.transaction_categories = (await pool.query(`SELECT c.* FROM transaction_categories c JOIN transactions t ON t.id=c.transaction_id WHERE t.user_id=$1 ORDER BY c.transaction_id`, [userId])).rows;
  data.transaction_provider_details = (await pool.query(`SELECT * FROM transaction_provider_details WHERE user_id=$1 ORDER BY transaction_id`, [userId])).rows;
  data.transaction_rules = (await pool.query(`SELECT * FROM transaction_rules WHERE user_id=$1 ORDER BY id`, [userId])).rows;
  data.supporting_documents = (await pool.query(`SELECT id,user_id,vault_file_id,tax_year,document_type,entity_type,entity_id,created_at FROM supporting_documents WHERE user_id=$1 ORDER BY id`, [userId])).rows;
  data.notifications = (await pool.query(`SELECT id,type,title,body,data,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY id`, [userId])).rows;
  data.activity_ledger = (await pool.query(`SELECT * FROM activity_ledger WHERE subject_user_id=$1 ORDER BY id`, [userId])).rows;
  data.vault_files = (await pool.query(`SELECT id,kind,filename,mime,size_bytes,created_at FROM vault_files WHERE user_id=$1 ORDER BY id`, [userId])).rows;
  data.households = (await pool.query(
    `SELECT h.id,h.name,h.created_by,h.created_at,hm.role,hm.ownership
       FROM households h
       JOIN household_members hm ON hm.household_id=h.id
      WHERE hm.user_id=$1 ORDER BY h.id`, [userId]
  )).rows;
  data.household_members = (await pool.query(
    `SELECT hm.household_id,hm.user_id,hm.role,hm.ownership,hm.joined_at
       FROM household_members hm
      WHERE hm.household_id IN (SELECT household_id FROM household_members WHERE user_id=$1)
      ORDER BY hm.household_id,hm.user_id`, [userId]
  )).rows;
  data.access_grants = (await pool.query(
    `SELECT id,owner_user_id,grantee_email,grantee_user_id,role,scopes,status,expires_at,created_at,revoked_at
       FROM access_grants WHERE owner_user_id=$1 ORDER BY id`, [userId]
  )).rows;
  return data;
}

async function loadTaxReadyExport(userId, taxYear) {
  const year = Number(taxYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new Error('Tax year must be a four-digit year.');
  }

  const data = await loadFinancialExport(userId);
  const start = `${year - 1}-07-01`;
  const end = `${year}-07-01`;
  const transactions = (await pool.query(
    `SELECT * FROM transactions
      WHERE user_id=$1 AND post_date >= $2::date AND post_date < $3::date
      ORDER BY post_date,id`, [userId, start, end]
  )).rows;
  const transactionIds = new Set(transactions.map((row) => String(row.id)));
  data.transactions = transactions;
  data.transaction_categories = (data.transaction_categories || []).filter((row) => transactionIds.has(String(row.transaction_id)));
  data.transaction_provider_details = (data.transaction_provider_details || []).filter((row) => transactionIds.has(String(row.transaction_id)));
  data.supporting_documents = (data.supporting_documents || []).filter((row) => Number(row.tax_year) === year);
  const documentFileIds = new Set(data.supporting_documents.map((row) => String(row.vault_file_id)));
  data.vault_files = (data.vault_files || []).filter((row) => documentFileIds.has(String(row.id)));
  data.notifications = [];
  data.activity_ledger = [];
  // Access relationships and household membership are collaboration metadata,
  // not tax records. Keep them in the full portability export, but do not
  // disclose them to a grantee receiving a tax-scoped export.
  data.access_grants = [];
  data.households = [];
  data.household_members = [];
  return { tax_year: year, tax_year_start: start, tax_year_end: end, ...data };
}
module.exports = { loadFinancialExport, loadTaxReadyExport };
