const pool = require('./pool');

async function openAlert({ fingerprint, severity, category, summary, details = {} }) {
  const { rows } = await pool.query(
    `INSERT INTO operational_alerts
       (fingerprint, severity, category, summary, details)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (fingerprint) WHERE status = 'open'
     DO UPDATE SET severity = EXCLUDED.severity, summary = EXCLUDED.summary,
       details = EXCLUDED.details, last_seen_at = NOW()
     RETURNING *`,
    [fingerprint, severity, category, summary, JSON.stringify(details)]
  );
  return rows[0];
}

async function resolveAlert(fingerprint) {
  await pool.query(
    `UPDATE operational_alerts SET status = 'resolved', resolved_at = NOW()
      WHERE fingerprint = $1 AND status = 'open'`,
    [fingerprint]
  );
}

async function listOpenAlerts() {
  const { rows } = await pool.query(
    `SELECT * FROM operational_alerts WHERE status = 'open'
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
               last_seen_at DESC`
  );
  return rows;
}

async function claimAlertDelivery(id, token) {
  const { rows } = await pool.query(
    `UPDATE operational_alerts
        SET delivery_claim_token = $2, delivery_claimed_at = NOW()
      WHERE id = $1 AND status = 'open'
        AND (last_delivered_at IS NULL OR last_delivered_at < NOW() - INTERVAL '6 hours')
        AND (delivery_claimed_at IS NULL OR delivery_claimed_at < NOW() - INTERVAL '5 minutes')
      RETURNING *`,
    [id, token]
  );
  return rows[0] || null;
}

async function recordAlertDelivery(id, token, error = null) {
  const result = await pool.query(
    `UPDATE operational_alerts
        SET delivery_attempts = delivery_attempts + 1,
            last_delivered_at = CASE WHEN $3::text IS NULL THEN NOW() ELSE last_delivered_at END,
            last_delivery_error = $3,
            delivery_claim_token = NULL, delivery_claimed_at = NULL
      WHERE id = $1 AND delivery_claim_token = $2`,
    [id, token, error]
  );
  return result.rowCount === 1;
}

async function startBackupVerification(targetFingerprint, status = 'running') {
  const { rows } = await pool.query(
    `INSERT INTO backup_verification_runs (target_fingerprint, status)
     VALUES ($1,$2) RETURNING *`,
    [targetFingerprint, status]
  );
  return rows[0];
}

async function finishBackupVerification(id, status, checks, error = null) {
  const { rows } = await pool.query(
    `UPDATE backup_verification_runs
        SET status = $2, checks = $3::jsonb, error = $4,
            completed_at = NOW()
      WHERE id = $1 RETURNING *`,
    [id, status, JSON.stringify(checks || {}), error]
  );
  return rows[0];
}

async function operationalSignals() {
  const [deadJobs, unhealthyConnections, latestBackup] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM background_jobs
        WHERE status = 'dead' AND completed_at >= NOW() - INTERVAL '24 hours'`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM provider_connection_health
        WHERE status IN ('degraded','reauthorization_required')`
    ),
    pool.query(
      `SELECT status, started_at FROM backup_verification_runs
        ORDER BY started_at DESC LIMIT 1`
    ),
  ]);
  return {
    deadJobs: Number(deadJobs.rows[0].count),
    unhealthyConnections: Number(unhealthyConnections.rows[0].count),
    latestBackup: latestBackup.rows[0] || null,
  };
}

async function touchBackupSourceMarker() {
  const { rows } = await pool.query(
    `UPDATE backup_source_markers
        SET generation = generation + 1, marked_at = NOW(),
            users_count = (SELECT COUNT(*) FROM users),
            raw_records_count = (SELECT COUNT(*) FROM raw_financial_records),
            transactions_count = (SELECT COUNT(*) FROM transactions),
            linked_accounts_count = (SELECT COUNT(*) FROM linked_accounts),
            cash_accounts_count = (SELECT COUNT(*) FROM cash_accounts),
            investments_count = (SELECT COUNT(*) FROM investments),
            debts_count = (SELECT COUNT(*) FROM debts),
            properties_count = (SELECT COUNT(*) FROM properties)
      WHERE id = 1 RETURNING *`
  );
  return rows[0];
}

async function primaryBackupBaseline() {
  const { rows } = await pool.query(
    `SELECT generation, marked_at, users_count, raw_records_count,
            transactions_count, linked_accounts_count, cash_accounts_count,
            investments_count, debts_count, properties_count
       FROM backup_source_markers marker WHERE marker.id = 1`
  );
  return rows[0];
}

module.exports = {
  openAlert, resolveAlert, listOpenAlerts, claimAlertDelivery, recordAlertDelivery,
  startBackupVerification, finishBackupVerification, operationalSignals,
  touchBackupSourceMarker, primaryBackupBaseline,
};
