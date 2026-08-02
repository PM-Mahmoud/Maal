const assert = require('assert');
const {
  databaseIdentity,
  REQUIRED_TABLES,
  inspectRestoredDatabase,
  compareDatasetCounts,
  compareRecoveryGeneration,
  deliverAlert,
  runBackupVerification,
  runOperationalSweep,
} = require('../services/operational-resilience');

(async () => {
  assert.equal(
    databaseIdentity('postgres://user@DB.EXAMPLE.com:5432/maal'),
    'db.example.com:5432/maal'
  );
  await assert.rejects(
    () => runBackupVerification({
      targetUrl: 'postgres://restore@db/maal',
      primaryUrl: 'postgres://primary@db/maal',
      database: {
        startBackupVerification: async () => ({ id: 1 }),
        finishBackupVerification: async () => null,
        openAlert: async (alert) => ({ id: 1, ...alert }),
        claimAlertDelivery: async (_id, token) => ({
          id: 1, severity: 'critical', category: 'backup_restore',
          summary: 'Unsafe', details: {}, fingerprint: 'unsafe', token,
        }),
        recordAlertDelivery: async () => null,
      },
    }),
    /primary database/
  );

  const restoredAt = new Date('2026-08-02T00:00:00Z');
  const checks = await inspectRestoredDatabase(async (sql) => {
    if (sql.includes('information_schema')) {
      return {
        rows: REQUIRED_TABLES.map((table_name) => ({ table_name })),
      };
    }
    if (sql.includes('_migrations')) {
      return { rows: [{ count: 12, latest: '2026-07-30T00:00:00Z' }] };
    }
    if (sql.includes('backup_source_markers')) {
      return { rows: [{ generation: 9, marked_at: restoredAt }] };
    }
    if (sql.includes('AS users_count')) {
      return { rows: [{
        users_count: 3, raw_records_count: 2, transactions_count: 5,
        linked_accounts_count: 2, cash_accounts_count: 1,
        investments_count: 1, debts_count: 1, properties_count: 1,
      }] };
    }
    return { rows: [{ count: 3 }] };
  }, new Date('2026-08-02T12:00:00Z'));
  assert.equal(Object.values(checks).every((check) => check.ok !== false), true);
  const staleChecks = await inspectRestoredDatabase(async (sql) => {
    if (sql.includes('information_schema')) {
      return { rows: REQUIRED_TABLES.map((table_name) => ({ table_name })) };
    }
    if (sql.includes('backup_source_markers')) {
      return { rows: [{ generation: 2, marked_at: '2026-07-29T00:00:00Z' }] };
    }
    if (sql.includes('AS users_count')) return { rows: [{}] };
    return { rows: [{ count: 1, latest: restoredAt }] };
  }, new Date('2026-08-02T12:00:00Z'));
  assert.equal(staleChecks.recovery_point.ok, false);

  const previousWebhook = process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
  process.env.OPERATIONAL_ALERT_WEBHOOK_URL = 'https://alerts.example.test/hook';
  const deliveries = [];
  assert.equal(await deliverAlert(
    { id: 4, severity: 'critical', category: 'test', summary: 'Test', details: {} },
    'delivery-claim',
    { recordAlertDelivery: async (...args) => deliveries.push(args) },
    async () => ({ ok: true, status: 200 })
  ), true);
  assert.deepStrictEqual(deliveries, [[4, 'delivery-claim']]);
  assert.equal(compareDatasetCounts(
    { users_count: 2, raw_records_count: 1 },
    { users_count: 3, raw_records_count: 1 }
  ).ok, false);
  assert.equal(compareRecoveryGeneration(9, 10).ok, false);
  if (previousWebhook === undefined) delete process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
  else process.env.OPERATIONAL_ALERT_WEBHOOK_URL = previousWebhook;

  const events = [];
  const database = {
    startBackupVerification: async () => ({ id: 9 }),
    finishBackupVerification: async (...args) => events.push(['finish', ...args]),
    openAlert: async (alert) => {
      events.push(['open', alert]);
      return { id: 3, ...alert };
    },
    recordAlertDelivery: async (...args) => events.push(['delivery', ...args]),
    claimAlertDelivery: async () => null,
    resolveAlert: async (...args) => events.push(['resolve', ...args]),
    primaryBackupBaseline: async () => ({
      generation: 9, marked_at: new Date(),
      users_count: 3, raw_records_count: 2, transactions_count: 5,
      linked_accounts_count: 2, cash_accounts_count: 1,
      investments_count: 1, debts_count: 1, properties_count: 1,
    }),
  };
  const client = {
    query: async (sql) => {
      if (sql.includes('information_schema')) {
        return {
          rows: REQUIRED_TABLES.map((table_name) => ({ table_name })),
        };
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('_migrations')) {
        return { rows: [{ count: 12, latest: new Date() }] };
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('users')) {
        return { rows: [{ count: 3 }] };
      }
      if (sql.includes('COUNT(*)::int') && sql.includes('raw_financial_records')) {
        return { rows: [{ count: 2 }] };
      }
      if (sql.includes('backup_source_markers')) {
        return { rows: [{ generation: 9, marked_at: new Date() }] };
      }
      if (sql.includes('AS users_count')) {
        return { rows: [{
          users_count: 3, raw_records_count: 2, transactions_count: 5,
          linked_accounts_count: 2, cash_accounts_count: 1,
          investments_count: 1, debts_count: 1, properties_count: 1,
        }] };
      }
      return { rows: [] };
    },
    release: () => null,
  };
  const result = await runBackupVerification({
    targetUrl: 'postgres://restore@restore-db/maal_restore',
    primaryUrl: 'postgres://primary@primary-db/maal',
    database,
    poolFactory: () => ({
      connect: async () => client,
      end: async () => null,
    }),
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(events[0][0], 'finish');

  const alerts = [];
  await runOperationalSweep({
    operationalSignals: async () => ({
      deadJobs: 2, unhealthyConnections: 1, latestBackup: null,
    }),
    openAlert: async (alert) => {
      alerts.push(['open', alert.fingerprint]);
      return { id: alerts.length, ...alert };
    },
    recordAlertDelivery: async () => null,
    claimAlertDelivery: async (_id, token) => ({
      id: 1, severity: 'critical', category: 'test', summary: 'test',
      details: {}, fingerprint: 'test', delivery_claim_token: token,
    }),
    resolveAlert: async (fingerprint) => alerts.push(['resolve', fingerprint]),
  });
  assert.deepStrictEqual(alerts, [
    ['open', 'background-jobs:dead'],
    ['open', 'connections:unhealthy'],
    ['open', 'backup-restore:stale'],
  ]);

  console.log('✓ operational alerts and restored-database verification are deterministic');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
