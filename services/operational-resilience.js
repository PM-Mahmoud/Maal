const crypto = require('crypto');
const { Pool } = require('pg');
const db = require('../db/operational-resilience');
const { databaseSsl } = require('../db/ssl');

const REQUIRED_TABLES = [
  'users', '_migrations', 'background_jobs', 'import_runs',
  'provider_connection_health', 'raw_financial_records',
  'backup_source_markers',
  'transactions', 'linked_accounts', 'cash_accounts',
  'investments', 'debts', 'properties',
];

function databaseIdentity(value) {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function targetFingerprint(value) {
  try {
    return crypto.createHash('sha256').update(databaseIdentity(value)).digest('hex').slice(0, 16);
  } catch {
    return 'not-configured';
  }
}

async function inspectRestoredDatabase(query, now = new Date()) {
  const tables = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  const missingTables = REQUIRED_TABLES.filter((table) => !found.has(table));
  const migrations = missingTables.includes('_migrations')
    ? { rows: [{ count: 0, latest: null }] }
    : await query(
      `SELECT COUNT(*)::int AS count, MAX(applied_at) AS latest FROM _migrations`
    );
  const users = missingTables.includes('users')
    ? { rows: [{ count: 0 }] }
    : await query('SELECT COUNT(*)::int AS count FROM users');
  const rawRecords = missingTables.includes('raw_financial_records')
    ? { rows: [{ count: 0 }] }
    : await query('SELECT COUNT(*)::int AS count FROM raw_financial_records');
  const marker = missingTables.includes('backup_source_markers')
    ? { rows: [] }
    : await query(
      `SELECT generation, marked_at FROM backup_source_markers WHERE id = 1`
    );
  const financialCounts = await query(
    `SELECT
       (SELECT COUNT(*)::bigint FROM users) AS users_count,
       (SELECT COUNT(*)::bigint FROM raw_financial_records) AS raw_records_count,
       (SELECT COUNT(*)::bigint FROM transactions) AS transactions_count,
       (SELECT COUNT(*)::bigint FROM linked_accounts) AS linked_accounts_count,
       (SELECT COUNT(*)::bigint FROM cash_accounts) AS cash_accounts_count,
       (SELECT COUNT(*)::bigint FROM investments) AS investments_count,
       (SELECT COUNT(*)::bigint FROM debts) AS debts_count,
       (SELECT COUNT(*)::bigint FROM properties) AS properties_count`
  );
  const recoveredAt = marker.rows[0]?.marked_at
    ? new Date(marker.rows[0].marked_at)
    : null;
  const recoveryAgeMs = recoveredAt ? now.getTime() - recoveredAt.getTime() : Infinity;
  return {
    required_tables: { ok: missingTables.length === 0, missing: missingTables },
    migrations: {
      ok: Number(migrations.rows[0].count) > 0,
      count: Number(migrations.rows[0].count),
      latest: migrations.rows[0].latest,
    },
    readable_users: { ok: true, count: Number(users.rows[0].count) },
    raw_records: { ok: true, count: Number(rawRecords.rows[0].count) },
    recovery_point: {
      ok: recoveryAgeMs >= 0 && recoveryAgeMs <= 30 * 60 * 60 * 1000,
      generation: marker.rows[0]?.generation || null,
      recovered_at: recoveredAt?.toISOString() || null,
      age_hours: Number.isFinite(recoveryAgeMs) ? recoveryAgeMs / 3600000 : null,
    },
    financial_counts: Object.fromEntries(
      Object.entries(financialCounts.rows[0] || {}).map(([key, value]) => [key, Number(value)])
    ),
  };
}

function compareDatasetCounts(restored, expected) {
  const fields = [
    'users_count', 'raw_records_count', 'transactions_count',
    'linked_accounts_count', 'cash_accounts_count', 'investments_count',
    'debts_count', 'properties_count',
  ];
  const mismatches = fields.filter(
    (field) => Number(restored[field]) !== Number(expected[field])
  ).map((field) => ({
    field, restored: Number(restored[field]), expected: Number(expected[field]),
  }));
  return { ok: mismatches.length === 0, mismatches };
}

function compareRecoveryGeneration(restored, expected) {
  return {
    ok: Number(restored) === Number(expected),
    restored: Number(restored),
    expected: Number(expected),
  };
}

async function deliverAlert(alert, claimToken, database = db, fetchImpl = global.fetch) {
  const webhook = String(process.env.OPERATIONAL_ALERT_WEBHOOK_URL || '').trim();
  if (!webhook) {
    await database.recordAlertDelivery(
      alert.id, claimToken, 'OPERATIONAL_ALERT_WEBHOOK_URL is not configured'
    );
    return false;
  }
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        severity: alert.severity,
        category: alert.category,
        summary: alert.summary,
        details: alert.details,
        fingerprint: alert.fingerprint,
      }),
    });
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    await database.recordAlertDelivery(alert.id, claimToken);
    return true;
  } catch (error) {
    await database.recordAlertDelivery(alert.id, claimToken, error.message);
    return false;
  }
}

async function openAndDeliverAlert(alert, database = db) {
  const row = await database.openAlert(alert);
  const token = crypto.randomUUID();
  const claimed = await database.claimAlertDelivery(row.id, token);
  if (claimed) await deliverAlert(claimed, token, database);
  return row;
}

async function runBackupVerification({
  targetUrl = process.env.BACKUP_RESTORE_DATABASE_URL,
  primaryUrl = process.env.DATABASE_URL,
  database = db,
  poolFactory = (config) => new Pool(config),
} = {}) {
  const fingerprint = targetFingerprint(targetUrl || '');
  if (!targetUrl) {
    const run = await database.startBackupVerification(fingerprint, 'not_configured');
    await database.finishBackupVerification(
      run.id, 'not_configured', {}, 'BACKUP_RESTORE_DATABASE_URL is not configured'
    );
    await openAndDeliverAlert({
      fingerprint: 'backup-restore:not-configured',
      severity: 'critical',
      category: 'backup_restore',
      summary: 'Backup restore verification is not configured',
    }, database);
    return { status: 'not_configured' };
  }
  if (primaryUrl && databaseIdentity(targetUrl) === databaseIdentity(primaryUrl)) {
    const error = new Error('Refusing to verify backup against the primary database');
    const run = await database.startBackupVerification(fingerprint);
    await database.finishBackupVerification(run.id, 'failed', {}, error.message);
    await openAndDeliverAlert({
      fingerprint: 'backup-restore:unsafe-target',
      severity: 'critical',
      category: 'backup_restore',
      summary: 'Backup verification target matches the primary database',
    }, database);
    throw error;
  }
  const run = await database.startBackupVerification(fingerprint);
  const primaryBaseline = await database.primaryBackupBaseline();
  const targetPool = poolFactory({
    connectionString: targetUrl,
    ssl: databaseSsl(targetUrl),
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  try {
    const client = await targetPool.connect();
    let checks;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '30s'");
      checks = await inspectRestoredDatabase(client.query.bind(client));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    checks.primary_baseline = primaryBaseline;
    checks.recovery_generation = compareRecoveryGeneration(
      checks.recovery_point.generation, primaryBaseline.generation
    );
    checks.dataset_counts = compareDatasetCounts(
      checks.financial_counts, primaryBaseline
    );
    const ok = Object.values(checks).every((check) => check.ok !== false);
    if (!ok) throw Object.assign(new Error('Restored database failed verification checks'), { checks });
    await database.finishBackupVerification(run.id, 'succeeded', checks);
    await database.resolveAlert('backup-restore:failed');
    await database.resolveAlert('backup-restore:not-configured');
    await database.resolveAlert('backup-restore:unsafe-target');
    return { status: 'succeeded', checks };
  } catch (error) {
    await database.finishBackupVerification(run.id, 'failed', error.checks || {}, error.message);
    await openAndDeliverAlert({
      fingerprint: 'backup-restore:failed',
      severity: 'critical',
      category: 'backup_restore',
      summary: 'Backup restore verification failed',
      details: { error: error.message, target: fingerprint },
    }, database);
    throw error;
  } finally {
    await targetPool.end();
  }
}

async function runOperationalSweep(database = db) {
  const signals = await database.operationalSignals();
  const backupAge = signals.latestBackup?.started_at
    ? Date.now() - new Date(signals.latestBackup.started_at).getTime()
    : Infinity;
  const rules = [
    {
      active: signals.deadJobs > 0,
      fingerprint: 'background-jobs:dead',
      severity: 'critical',
      category: 'background_jobs',
      summary: `${signals.deadJobs} background job(s) died in the last 24 hours`,
      details: { count: signals.deadJobs },
    },
    {
      active: signals.unhealthyConnections > 0,
      fingerprint: 'connections:unhealthy',
      severity: 'warning',
      category: 'connections',
      summary: `${signals.unhealthyConnections} provider connection(s) need attention`,
      details: { count: signals.unhealthyConnections },
    },
    {
      active: signals.latestBackup?.status !== 'succeeded'
        || backupAge > 26 * 60 * 60 * 1000,
      fingerprint: 'backup-restore:stale',
      severity: 'critical',
      category: 'backup_restore',
      summary: 'No recent successful backup restore verification',
      details: { latest: signals.latestBackup },
    },
  ];
  for (const rule of rules) {
    if (rule.active) await openAndDeliverAlert(rule, database);
    else await database.resolveAlert(rule.fingerprint);
  }
  return signals;
}

module.exports = {
  REQUIRED_TABLES, databaseIdentity, targetFingerprint,
  inspectRestoredDatabase, compareDatasetCounts, compareRecoveryGeneration,
  deliverAlert, openAndDeliverAlert,
  runBackupVerification, runOperationalSweep,
};
