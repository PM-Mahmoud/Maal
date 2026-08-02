// Opt-in PostgreSQL contract test. It deliberately refuses non-local or
// non-test databases because it recreates the public schema.
const assert = require('assert');
const { Pool } = require('pg');
const migration = require('../migrations/1753900000000_financial_integrity');
const runsMigration = require('../migrations/1754000000000_data_quality_runs');
const reconciliationMigration = require('../migrations/1754100000000_account_reconciliation');
const lineageMigration = require('../migrations/1754200000000_calculation_lineage');
const jobsMigration = require('../migrations/1754300000000_background_jobs');
const importRunsMigration = require('../migrations/1754400000000_import_runs');
const connectionHealthMigration = require('../migrations/1754500000000_connection_health');
const resilienceMigration = require('../migrations/1754600000000_operational_resilience');

async function expectPgError(fn, expectedCode) {
  let error;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `Expected PostgreSQL error ${expectedCode}`);
  assert.equal(error.code, expectedCode);
}

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Refusing to run: DATABASE_URL must target a local database ending in _test');
  }

  const pool = new Pool({ connectionString: url.toString() });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.query('CREATE TABLE users (id BIGSERIAL PRIMARY KEY, basiq_user_id TEXT)');
    await pool.query(`
      CREATE TABLE linked_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        institution_name TEXT, institution_type TEXT, account_reference TEXT, balance NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE cash_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, institution TEXT, balance BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE investments (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT, kind TEXT, value BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE debts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, kind TEXT, balance BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE properties (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, value BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE super_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, fund_name TEXT, balance BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE transactions (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        basiq_id TEXT UNIQUE, description TEXT, amount NUMERIC, status TEXT,
        post_date DATE, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await migration.up(pool);
    await runsMigration.up(pool);
    await reconciliationMigration.up(pool);
    await lineageMigration.up(pool);
    await jobsMigration.up(pool);
    await importRunsMigration.up(pool);
    await connectionHealthMigration.up(pool);
    await resilienceMigration.up(pool);

    const firstUser = (await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
    const secondUser = (await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
    global.__maalPool = pool;
    delete require.cache[require.resolve('../db/background-jobs')];
    const jobsDb = require('../db/background-jobs');
    const firstJob = await jobsDb.enqueueJob({
      userId: firstUser,
      queue: 'financial',
      jobType: 'sync',
      payload: { account: 'a1' },
      idempotencyKey: 'same-key',
      maxAttempts: 2,
    });
    const duplicateJob = await jobsDb.enqueueJob({
      userId: firstUser,
      queue: 'financial',
      jobType: 'sync',
      payload: { account: 'changed-payload-is-not-applied' },
      idempotencyKey: 'same-key',
      maxAttempts: 2,
    });
    assert.equal(duplicateJob.id, firstJob.id, 'idempotent enqueue must return the existing job');
    const concurrentEnqueues = await Promise.all(
      Array.from({ length: 4 }, () => jobsDb.enqueueJob({
        userId: firstUser,
        queue: 'financial',
        jobType: 'concurrent',
        idempotencyKey: 'concurrent-key',
      }))
    );
    assert.equal(
      new Set(concurrentEnqueues.map((job) => job.id)).size,
      1,
      'concurrent idempotent enqueues must converge on one durable job'
    );
    const otherUserJob = await jobsDb.enqueueJob({
      userId: secondUser,
      queue: 'financial',
      jobType: 'sync',
      idempotencyKey: 'same-key',
    });
    assert.notEqual(otherUserJob.id, firstJob.id, 'idempotency keys are tenant-scoped');
    const secondJob = await jobsDb.enqueueJob({
      userId: firstUser,
      queue: 'financial',
      jobType: 'snapshot',
      priority: 10,
    });
    const [claimA, claimB] = await Promise.all([
      jobsDb.claimNextJob({ workerId: 'worker-a', queues: ['financial'], leaseSeconds: 30 }),
      jobsDb.claimNextJob({ workerId: 'worker-b', queues: ['financial'], leaseSeconds: 30 }),
    ]);
    assert.notEqual(claimA.id, claimB.id, 'concurrent workers must not claim the same job');
    assert.equal(
      new Set([claimA.id, claimB.id]).has(secondJob.id),
      true,
      'priority jobs must be claimable before lower-priority work'
    );
    await assert.rejects(
      () => jobsDb.completeJob(claimA.id, 'not-the-owner', {}),
      /lease is no longer owned/
    );
    await jobsDb.heartbeatJob(claimA.id, claimA.locked_by, 30);
    await jobsDb.completeJob(claimA.id, claimA.locked_by, { ok: true });
    const retry = await jobsDb.failJob(claimB.id, claimB.locked_by, new Error('temporary'));
    assert.equal(retry.status, retry.attempts >= retry.max_attempts ? 'dead' : 'queued');
    const ownJobs = await jobsDb.listJobsForUser(firstUser);
    assert.equal(ownJobs.some((job) => job.id === otherUserJob.id), false);
    assert.equal(ownJobs.length >= 2, true);
    const leasedJob = await jobsDb.enqueueJob({
      userId: firstUser,
      queue: 'lease-test',
      jobType: 'recoverable',
      maxAttempts: 2,
    });
    const firstLease = await jobsDb.claimNextJob({
      workerId: 'worker-expired',
      queues: ['lease-test'],
      leaseSeconds: 30,
    });
    await pool.query(
      `UPDATE background_jobs SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE id = $1`,
      [leasedJob.id]
    );
    const recoveredLease = await jobsDb.claimNextJob({
      workerId: 'worker-recovery',
      queues: ['lease-test'],
      leaseSeconds: 30,
    });
    assert.equal(recoveredLease.id, firstLease.id);
    assert.equal(recoveredLease.attempts, 2);
    const deadJob = await jobsDb.failJob(
      recoveredLease.id,
      'worker-recovery',
      new Error('final failure')
    );
    assert.equal(deadJob.status, 'dead');
    delete require.cache[require.resolve('../db/import-runs')];
    const importRunsDb = require('../db/import-runs');
    const connectionHealthDb = require('../db/connection-health');
    const resilienceDb = require('../db/operational-resilience');
    const deduplicatedAlert = await resilienceDb.openAlert({
      fingerprint: 'contract:dead-jobs',
      severity: 'critical',
      category: 'background_jobs',
      summary: 'One dead job',
      details: { count: 1 },
    });
    await resilienceDb.openAlert({
      fingerprint: 'contract:dead-jobs',
      severity: 'critical',
      category: 'background_jobs',
      summary: 'Two dead jobs',
      details: { count: 2 },
    });
    assert.equal(
      (await resilienceDb.listOpenAlerts()).filter(
        (alert) => alert.fingerprint === 'contract:dead-jobs'
      ).length,
      1,
      'operational alerts must deduplicate while open'
    );
    const deliveryClaims = await Promise.all([
      resilienceDb.claimAlertDelivery(deduplicatedAlert.id, 'contract-delivery-a'),
      resilienceDb.claimAlertDelivery(deduplicatedAlert.id, 'contract-delivery-b'),
    ]);
    assert.equal(
      deliveryClaims.filter(Boolean).length, 1,
      'concurrent alert delivery attempts must produce one durable claim'
    );
    const deliveryToken = deliveryClaims[0]
      ? 'contract-delivery-a'
      : 'contract-delivery-b';
    await resilienceDb.recordAlertDelivery(
      deduplicatedAlert.id, deliveryToken
    );
    assert.equal(
      (await resilienceDb.listOpenAlerts()).find(
        (alert) => alert.fingerprint === 'contract:dead-jobs'
      ).delivery_attempts,
      1,
      'alert delivery attempts must be retained'
    );
    await resilienceDb.resolveAlert('contract:dead-jobs');
    const backupRun = await resilienceDb.startBackupVerification('restore-contract');
    await resilienceDb.finishBackupVerification(
      backupRun.id, 'succeeded', { required_tables: { ok: true } }
    );
    const baselineBefore = await resilienceDb.primaryBackupBaseline();
    const advancedMarker = await resilienceDb.touchBackupSourceMarker();
    assert.equal(
      Number(advancedMarker.generation),
      Number(baselineBefore.generation) + 1,
      'backup source markers must advance monotonically'
    );
    await connectionHealthDb.upsertHealth(firstUser, 'basiq', {
      status: 'expiring',
      providerStatus: 'active',
      consentExpiresAt: '2026-08-03T00:00:00Z',
      consecutiveFailures: 0,
    });
    assert.equal(
      (await connectionHealthDb.getHealth(firstUser)).status,
      'expiring'
    );
    assert.equal(
      await connectionHealthDb.getHealth(secondUser),
      null,
      'connection health must remain tenant-scoped'
    );
    await connectionHealthDb.upsertHealth(firstUser, 'basiq', {
      status: 'healthy',
      consentExpiresAt: null,
      replaceConsent: true,
      consecutiveFailures: 0,
    });
    assert.equal(
      (await connectionHealthDb.getHealth(firstUser)).consent_expires_at,
      null,
      'an authoritative provider check must clear stale consent expiry'
    );
    await pool.query(
      'UPDATE users SET basiq_user_id = $2 WHERE id = $1',
      [firstUser, 'provider-existing-user']
    );
    const connectionHealthService = require('../services/connection-health');
    await connectionHealthService.seedConnectionHealthJobs();
    await connectionHealthService.seedConnectionHealthJobs();
    assert.equal(
      Number((await pool.query(
        `SELECT COUNT(*) AS count FROM background_jobs
          WHERE user_id = $1 AND job_type = 'basiq_connection_health'`,
        [firstUser]
      )).rows[0].count),
      1,
      'monitoring bootstrap must be idempotent for existing linked users'
    );
    await connectionHealthDb.scheduleBasiqHealthCheck(
      firstUser, new Date('2026-08-02T05:00:00Z')
    );
    assert.equal(
      Number((await pool.query(
        `SELECT COUNT(*) AS count FROM background_jobs
          WHERE user_id = $1 AND job_type = 'basiq_connection_health'
            AND status IN ('queued','running')`,
        [firstUser]
      )).rows[0].count),
      1,
      'a restart in a different hour must not create another active monitor'
    );
    const healthJob = await jobsDb.claimNextJob({
      workerId: 'health-worker', queues: ['monitoring'], leaseSeconds: 30,
    });
    await connectionHealthDb.scheduleBasiqHealthCheck(
      firstUser, new Date('2026-08-03T05:00:00Z'), healthJob.id
    );
    await jobsDb.completeJob(healthJob.id, 'health-worker', { status: 'healthy' });
    assert.equal(
      Number((await pool.query(
        `SELECT COUNT(*) AS count FROM background_jobs
          WHERE user_id = $1 AND job_type = 'basiq_connection_health'
            AND status IN ('queued','running')`,
        [firstUser]
      )).rows[0].count),
      1,
      'a completed health check must leave exactly one durable successor'
    );
    const queuedImport = await importRunsDb.enqueueImportRun(firstUser, {
      requestKey: 'manual-sync-1',
    });
    const duplicateImport = await importRunsDb.enqueueImportRun(firstUser, {
      requestKey: 'manual-sync-1',
    });
    assert.equal(duplicateImport.run.id, queuedImport.run.id);
    assert.equal(duplicateImport.job.id, queuedImport.job.id);
    const otherImport = await importRunsDb.enqueueImportRun(secondUser, {
      requestKey: 'manual-sync-1',
    });
    assert.notEqual(otherImport.run.id, queuedImport.run.id);
    await pool.query(
      'UPDATE background_jobs SET priority = 10 WHERE id = $1',
      [queuedImport.job.id]
    );
    const importJobAttempt1 = await jobsDb.claimNextJob({
      workerId: 'import-worker-1', queues: ['imports'], leaseSeconds: 30,
    });
    const importAttempt1 = {
      token: 'attempt-1', jobId: importJobAttempt1.id,
      workerId: 'import-worker-1', attempts: importJobAttempt1.attempts,
    };
    await importRunsDb.startImportRun(queuedImport.run.id, firstUser, importAttempt1);
    await importRunsDb.updateImportProgress(
      queuedImport.run.id, firstUser, importAttempt1, 'accounts',
      { imported: 2 }, { account_count: 2 }
    );
    await importRunsDb.failImportRun(
      queuedImport.run.id, firstUser, importAttempt1,
      new Error('temporary provider error'), true
    );
    await jobsDb.failJob(
      importJobAttempt1.id, 'import-worker-1', new Error('temporary provider error')
    );
    await pool.query(
      'UPDATE background_jobs SET run_at = NOW() WHERE id = $1',
      [importJobAttempt1.id]
    );
    const importJobAttempt2 = await jobsDb.claimNextJob({
      workerId: 'import-worker-2', queues: ['imports'], leaseSeconds: 30,
    });
    const importAttempt2 = {
      token: 'attempt-2', jobId: importJobAttempt2.id,
      workerId: 'import-worker-2', attempts: importJobAttempt2.attempts,
    };
    const resumedImport = await importRunsDb.startImportRun(
      queuedImport.run.id, firstUser, importAttempt2
    );
    assert.equal(resumedImport.attempt_count, 2);
    assert.deepStrictEqual(resumedImport.progress.accounts, { imported: 2 });
    assert.deepStrictEqual(resumedImport.checkpoints.accounts, { account_count: 2 });
    await assert.rejects(
      () => importRunsDb.updateImportProgress(
        queuedImport.run.id, firstUser, importAttempt1, 'transactions', {}, {}
      ),
      (error) => error.code === 'JOB_LEASE_LOST'
    );
    await importRunsDb.completeImportRun(
      queuedImport.run.id, firstUser, importAttempt2,
      { accounts: 2, transactions: 4 }
    );
    const crashImport = await importRunsDb.enqueueImportRun(firstUser, {
      requestKey: 'crash-recovery',
    });
    await pool.query(
      'UPDATE background_jobs SET priority = 20 WHERE id = $1',
      [crashImport.job.id]
    );
    const crashedJob = await jobsDb.claimNextJob({
      workerId: 'crashed-worker', queues: ['imports'], leaseSeconds: 30,
    });
    const crashedAttempt = {
      token: 'crashed-attempt', jobId: crashedJob.id,
      workerId: 'crashed-worker', attempts: crashedJob.attempts,
    };
    await importRunsDb.startImportRun(crashImport.run.id, firstUser, crashedAttempt);
    await pool.query(
      `UPDATE background_jobs SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE id = $1`,
      [crashedJob.id]
    );
    const recoveryJob = await jobsDb.claimNextJob({
      workerId: 'recovery-worker', queues: ['imports'], leaseSeconds: 30,
    });
    const recoveryAttempt = {
      token: 'recovery-attempt', jobId: recoveryJob.id,
      workerId: 'recovery-worker', attempts: recoveryJob.attempts,
    };
    await importRunsDb.startImportRun(crashImport.run.id, firstUser, recoveryAttempt);
    await assert.rejects(
      () => importRunsDb.updateImportProgress(
        crashImport.run.id, firstUser, crashedAttempt, 'accounts', {}, {}
      ),
      (error) => error.code === 'JOB_LEASE_LOST'
    );
    let releaseFencedMutation;
    let fenceAcquired;
    const fenceReady = new Promise((resolve) => { fenceAcquired = resolve; });
    const mutationGate = new Promise((resolve) => { releaseFencedMutation = resolve; });
    const fencedMutation = importRunsDb.withImportFence(
      crashImport.run.id, firstUser, recoveryAttempt,
      async () => {
        fenceAcquired();
        await mutationGate;
        await pool.query(
          `INSERT INTO raw_financial_records
             (user_id, source, entity_type, source_record_id, payload, payload_hash)
           VALUES ($1, 'basiq', 'account', 'fenced-write', '{}', 'fenced-hash')`,
          [firstUser]
        );
      }
    );
    await fenceReady;
    const takeover = pool.query(
      `UPDATE background_jobs SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE id = $1`,
      [recoveryJob.id]
    );
    assert.equal(
      await Promise.race([
        takeover.then(() => 'took-over'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 50)),
      ]),
      'blocked',
      'takeover must wait while a fenced financial mutation holds the job row'
    );
    releaseFencedMutation();
    await fencedMutation;
    await takeover;
    assert.equal(
      Number((await pool.query(
        `SELECT COUNT(*) AS count FROM raw_financial_records
          WHERE user_id = $1 AND source_record_id = 'fenced-write'`,
        [firstUser]
      )).rows[0].count),
      1
    );
    await assert.rejects(
      () => importRunsDb.withImportFence(
        crashImport.run.id, firstUser, recoveryAttempt, async () => {
          throw new Error('stale mutation should never execute');
        }
      ),
      (error) => error.code === 'JOB_LEASE_LOST'
    );
    await pool.query(
      `UPDATE background_jobs SET lease_expires_at = NOW() + INTERVAL '30 seconds'
        WHERE id = $1`,
      [recoveryJob.id]
    );
    await importRunsDb.completeImportRun(
      crashImport.run.id, firstUser, recoveryAttempt, { accounts: 0, transactions: 0 }
    );
    assert.equal(
      await importRunsDb.getImportRunForUser(queuedImport.run.id, secondUser),
      null,
      'import-run visibility must remain tenant-scoped'
    );
    const ownedTransaction = (await pool.query(
      `INSERT INTO transactions (user_id, basiq_id, amount, post_date)
       VALUES ($1, 'owned', 1, '2026-07-01') RETURNING id`,
      [firstUser]
    )).rows[0].id;
    await expectPgError(
      () => pool.query(
        `INSERT INTO transaction_provider_details
           (transaction_id, user_id, account_reference, balance_after)
         VALUES ($1, $2, 'basiq:a1', 10)`,
        [ownedTransaction, secondUser]
      ),
      'P0001'
    );
    await pool.query('DELETE FROM transactions WHERE id = $1', [ownedTransaction]);

    delete require.cache[require.resolve('../db/transactions')];
    const transactionDb = require('../db/transactions');
    await transactionDb.upsertBasiqTransactions(firstUser, [{
      id: 'stale-link', amount: 1, postDate: '2026-07-01T01:00:00Z',
      account: 'a1', balance: 10,
    }]);
    await transactionDb.upsertBasiqTransactions(firstUser, [{
      id: 'stale-link', amount: 1, postDate: '2026-07-01T01:00:00Z',
    }]);
    const staleDetails = await pool.query(
      `SELECT 1 FROM transaction_provider_details d
        JOIN transactions t ON t.id = d.transaction_id
       WHERE t.basiq_id = 'stale-link'`
    );
    assert.equal(staleDetails.rowCount, 0, 'removed provider account links must not remain as evidence');
    await pool.query(`DELETE FROM transactions WHERE basiq_id = 'stale-link'`);

    await pool.query(
      `INSERT INTO linked_accounts
         (user_id, institution_name, account_reference, balance)
       VALUES ($1, 'Preserve', 'basiq:a-bad', 50),
              ($1, 'Gone', 'basiq:gone', 60)`,
      [firstUser]
    );
    await pool.query(
      `INSERT INTO cash_accounts
         (user_id, label, balance, source, account_reference)
       VALUES ($1, 'Preserve', 50, 'basiq', 'basiq:a-bad'),
              ($1, 'Gone', 60, 'basiq', 'basiq:gone')`,
      [firstUser]
    );
    global.__maalPool = pool;
    delete require.cache[require.resolve('../db/pool')];
    delete require.cache[require.resolve('../db/basiq-import')];
    const basiqImport = require('../db/basiq-import');
    await basiqImport.replaceBasiqAccounts(firstUser, [{
      linked: {
        institution_name: 'Good', institution_type: 'bank',
        account_reference: 'basiq:good', balance: 100,
      },
      bucket: 'cash',
      row: {
        label: 'Good', institution: 'Good', balance: 100,
        account_reference: 'basiq:good',
      },
    }], ['basiq:a-bad']);
    const accountRefs = (await pool.query(
      'SELECT account_reference FROM cash_accounts WHERE user_id = $1 ORDER BY account_reference',
      [firstUser]
    )).rows.map((row) => row.account_reference);
    assert.deepStrictEqual(accountRefs, ['basiq:a-bad', 'basiq:good']);

    await assert.rejects(
      () => basiqImport.replaceBasiqAccounts(firstUser, [{
        linked: {
          institution_name: 'Broken', institution_type: 'bank',
          account_reference: 'basiq:broken', balance: 1,
        },
        bucket: 'unsupported',
        row: {},
      }]),
      /Unsupported Basiq account bucket/
    );
    const refsAfterRollback = (await pool.query(
      'SELECT account_reference FROM cash_accounts WHERE user_id = $1 ORDER BY account_reference',
      [firstUser]
    )).rows.map((row) => row.account_reference);
    assert.deepStrictEqual(refsAfterRollback, accountRefs, 'failed replacement must roll back atomically');

    const reconciliationTxns = (await pool.query(
      `INSERT INTO transactions (user_id, basiq_id, amount, status, post_date)
       VALUES ($1, 'recon-1', 10, 'posted', '2026-07-01'),
              ($1, 'recon-2', 20, 'posted', '2026-07-02')
       RETURNING id, basiq_id`,
      [firstUser]
    )).rows;
    await pool.query(
      `INSERT INTO transaction_provider_details
         (transaction_id, user_id, account_reference, balance_after)
       VALUES ($1, $3, 'basiq:good', 80),
              ($2, $3, 'basiq:good', 100)`,
      [reconciliationTxns[0].id, reconciliationTxns[1].id, firstUser]
    );
    delete require.cache[require.resolve('../db/reconciliation')];
    delete require.cache[require.resolve('../services/reconciliation')];
    const reconciliationService = require('../services/reconciliation');
    const reconciliationRows = await reconciliationService.reconcileAccounts(firstUser);
    assert.equal(
      reconciliationRows.find((row) => row.account_reference === 'basiq:good').status,
      'matched'
    );
    await expectPgError(
      () => pool.query(
        `INSERT INTO account_reconciliations
           (user_id, account_reference, status, anchor_transaction_id)
         VALUES ($2, 'basiq:foreign-anchor', 'matched', $1)`,
        [reconciliationTxns[0].id, secondUser]
      ),
      'P0001'
    );
    await pool.query('DELETE FROM transactions WHERE basiq_id IN ($1, $2)', ['recon-1', 'recon-2']);
    const clearedAnchor = await pool.query(
      `SELECT anchor_transaction_id FROM account_reconciliations
        WHERE user_id = $1 AND account_reference = 'basiq:good'`,
      [firstUser]
    );
    assert.equal(clearedAnchor.rows[0].anchor_transaction_id, null);
    await pool.query(
      `INSERT INTO data_quality_runs
         (user_id, trigger, status, warning_count)
       VALUES ($1, 'basiq_sync', 'attention', 1)`,
      [firstUser]
    );
    await pool.query(
      `INSERT INTO data_quality_runs
         (user_id, trigger, status, coverage)
       VALUES ($1, 'manual', 'healthy', '{"accounts":"complete","transactions":"complete"}'),
              ($2, 'basiq_sync', 'failed', '{"accounts":"failed"}')`,
      [firstUser, secondUser]
    );
    await pool.query(
      `INSERT INTO data_quality_findings
         (user_id, check_code, entity_type, entity_key, severity, summary)
       VALUES ($1, 'account.stale', 'account', 'own', 'warning', 'Own finding'),
              ($2, 'account.stale', 'account', 'other', 'error', 'Other user finding')`,
      [firstUser, secondUser]
    );

    global.__authPool = pool;
    delete require.cache[require.resolve('../db/auth')];
    delete require.cache[require.resolve('../db/financial-integrity')];
    const health = await require('../db/financial-integrity').getDataHealth(firstUser);
    assert.equal(health.status, 'healthy', 'latest run wins for the scoped user');
    assert.deepStrictEqual(health.coverage, { accounts: 'complete', transactions: 'complete' });
    assert.equal(health.findings.length, 1);
    assert.equal(health.findings[0].entity_key, 'own', 'other users findings must never leak');

    delete require.cache[require.resolve('../db/transactions')];
    const transactionsDb = require('../db/transactions');
    await assert.rejects(
      () => transactionsDb.upsertBasiqTransactions(firstUser, [
        { id: 'valid-first', amount: 1, postDate: '2026-07-01' },
        { id: 'invalid-second', amount: 2, postDate: 'not-a-date' },
      ])
    );
    assert.equal(
      Number((await pool.query('SELECT COUNT(*) AS count FROM transactions WHERE user_id = $1', [firstUser])).rows[0].count),
      0,
      'a failed Basiq transaction batch must roll back every row'
    );
    const raw = (await pool.query(
      `INSERT INTO raw_financial_records
         (user_id, source, entity_type, source_record_id, payload, payload_hash)
       VALUES ($1, 'basiq', 'transaction', 'txn-1', '{"amount":10}', 'hash-1')
       RETURNING id`,
      [firstUser]
    )).rows[0].id;

    await expectPgError(
      () => pool.query('UPDATE raw_financial_records SET payload = $1 WHERE id = $2', ['{}', raw]),
      'P0001'
    );
    await expectPgError(
      () => pool.query('DELETE FROM raw_financial_records WHERE id = $1', [raw]),
      'P0001'
    );

    const audit = (await pool.query(
      `INSERT INTO calculation_audits
         (user_id, calculation_type, calculation_version, effective_at, inputs, result)
       VALUES ($1, 'net_worth', '1', NOW(), '{}', '{}') RETURNING id`,
      [secondUser]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO calculation_audits
         (user_id, calculation_type, calculation_version, effective_at, inputs, assumptions, result)
       VALUES ($1, 'net_worth', '1', NOW(), '{"assets_total":100}', '{}', '{"net_worth":90}'),
              ($1, 'maal_score', '1', NOW(), '{"annual_income":100}', '{}', '{"score":70}'),
              ($1, 'cash_flow', '1', NOW(), '{"transaction_count":2}', '{}', '{"net_cash_flow":10}'),
              ($1, 'investment_metrics', '1', NOW(), '{"holding_count":1}', '{}', '{"current_value":20}')`,
      [firstUser]
    );
    const integrityDb = require('../db/financial-integrity');
    const firstCalculationId = await integrityDb.recordCalculation(firstUser, {
      type: 'net_worth',
      version: 'dedupe-test',
      effectiveAt: '2026-07-30T01:00:00Z',
      inputs: { assets_total: 100 },
      result: { net_worth: 90 },
    });
    const repeatedCalculationId = await integrityDb.recordCalculation(firstUser, {
      type: 'net_worth',
      version: 'dedupe-test',
      effectiveAt: '2026-07-30T20:00:00Z',
      inputs: { assets_total: 100 },
      result: { net_worth: 90 },
    });
    assert.equal(
      repeatedCalculationId,
      firstCalculationId,
      'identical calculations on the same effective date must be idempotent'
    );
    const changedCalculationId = await integrityDb.recordCalculation(firstUser, {
      type: 'net_worth',
      version: 'dedupe-test',
      effectiveAt: '2026-07-30T21:00:00Z',
      inputs: { assets_total: 101 },
      result: { net_worth: 91 },
    });
    assert.notEqual(
      changedCalculationId,
      firstCalculationId,
      'changed same-day inputs must create distinct lineage'
    );
    const ownLineage = await integrityDb.listCalculationLineage(firstUser, { limit: 10 });
    assert.deepStrictEqual(
      new Set(ownLineage.map((row) => row.calculation_type)),
      new Set(['net_worth', 'maal_score', 'cash_flow', 'investment_metrics'])
    );
    assert.equal(
      ownLineage.some((row) => row.id === audit),
      false,
      'calculation lineage must never include another user'
    );
    const scoreOnly = await integrityDb.listCalculationLineage(firstUser, {
      type: 'maal_score',
      limit: 10,
    });
    assert.deepStrictEqual(scoreOnly.map((row) => row.calculation_type), ['maal_score']);
    await expectPgError(
      () => pool.query(
        `UPDATE calculation_audits SET result = '{}' WHERE id = $1`,
        [ownLineage[0].id]
      ),
      'P0001'
    );
    await expectPgError(
      () => pool.query('DELETE FROM calculation_audits WHERE id = $1', [ownLineage[0].id]),
      'P0001'
    );
    await expectPgError(
      () => pool.query(
        `INSERT INTO calculation_audit_sources
           (calculation_audit_id, raw_record_id, user_id) VALUES ($1, $2, $3)`,
        [audit, raw, secondUser]
      ),
      '23503'
    );

    await pool.query('DELETE FROM users WHERE id = $1', [firstUser]);
    assert.equal(
      Number((await pool.query('SELECT COUNT(*) AS count FROM raw_financial_records WHERE id = $1', [raw])).rows[0].count),
      0,
      'account erasure must cascade to raw evidence'
    );
    assert.equal(
      Number((await pool.query('SELECT COUNT(*) AS count FROM data_quality_runs WHERE user_id = $1', [firstUser])).rows[0].count),
      0,
      'account erasure must cascade to quality-run history'
    );

    console.log('✓ financial-integrity PostgreSQL contract passed');
  } finally {
    const authPool = global.__authPool;
    const maalPool = global.__maalPool;
    delete global.__authPool;
    delete global.__maalPool;
    if (authPool && authPool !== pool) await authPool.end();
    if (maalPool && maalPool !== pool && maalPool !== authPool) await maalPool.end();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
