const pool = require('./pool');
const DIRECT_TABLES = [
  'user_profiles','cash_accounts','investments','properties','debts','super_accounts','incomes','other_assets',
  'linked_accounts','transactions','goals','account_reconciliations','account_reconciliation_adjustments',
  'net_worth_snapshots','monthly_financial_closes','radars','research_reports',
  'financial_scores','maal_score_snapshots','recommendations','raw_financial_records','calculation_audits',
  'calculation_audit_sources','data_quality_findings','data_quality_runs','import_runs',
  'provider_connection_health','transaction_sync_cursors','transaction_category_feedback','background_jobs',
];
async function loadFinancialExport(userId) {
  const data = {};
  for (const table of DIRECT_TABLES) {
    data[table] = (await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY id`, [userId])).rows;
  }
  data.users = (await pool.query(`SELECT id,email,name,plan,created_at FROM users WHERE id=$1`, [userId])).rows;
  data.radar_events = (await pool.query(`SELECT e.* FROM radar_events e JOIN radars r ON r.id=e.radar_id WHERE r.user_id=$1 ORDER BY e.id`, [userId])).rows;
  data.transaction_categories = (await pool.query(`SELECT c.* FROM transaction_categories c JOIN transactions t ON t.id=c.transaction_id WHERE t.user_id=$1 ORDER BY c.transaction_id`, [userId])).rows;
  data.transaction_provider_details = (await pool.query(`SELECT * FROM transaction_provider_details WHERE user_id=$1 ORDER BY transaction_id`, [userId])).rows;
  data.transaction_rules = (await pool.query(`SELECT * FROM transaction_rules WHERE user_id=$1 ORDER BY id`, [userId])).rows;
  data.vault_files = (await pool.query(`SELECT id,kind,filename,mime,size_bytes,created_at FROM vault_files WHERE user_id=$1 ORDER BY id`, [userId])).rows;
  return data;
}
module.exports = { loadFinancialExport };
