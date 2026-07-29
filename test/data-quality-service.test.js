const assert = require('assert');
const {
  ALL_CHECKS,
  createDataQualityService,
} = require('../services/data-quality');
const { countsFor, statusForCounts } = require('../db/financial-integrity');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('✓', name);
}

async function main() {
  await test('runner checks imported transactions and connected accounts in one persisted run', async () => {
    let persisted;
    const service = createDataQualityService({
      getTransactionsForQuality: async (userId) => {
        assert.equal(userId, 7);
        return [{ id: 1, basiq_id: 'txn-1', amount: null, post_date: '2026-07-01' }];
      },
      listBasiqAccountsForQuality: async () => [
        { id: 2, source: 'basiq', account_reference: 'basiq:2', balance: 100, updated_at: null },
      ],
      syncFindings: async (userId, findings, checkCodes, options) => {
        persisted = { userId, findings, checkCodes, options };
        const counts = countsFor(findings);
        return { findings: findings.length, counts, status: statusForCounts(counts) };
      },
      getDataHealth: async () => null,
      recordDataQualityFailure: async () => null,
    });

    const result = await service.run(7, {
      trigger: 'basiq_sync',
      now: '2026-07-30T00:00:00Z',
    });
    assert.equal(result.status, 'critical');
    assert.deepStrictEqual(result.checked, { transactions: 1, accounts: 1 });
    assert.equal(persisted.userId, 7);
    assert.deepStrictEqual(persisted.checkCodes, ALL_CHECKS);
    assert.equal(persisted.options.trigger, 'basiq_sync');
    assert.deepStrictEqual(
      persisted.findings.map((item) => item.check_code).sort(),
      ['account.missing_freshness', 'transaction.invalid_amount']
    );
  });

  await test('clean imports are recorded as healthy rather than not checked', async () => {
    let receivedFindings;
    const service = createDataQualityService({
      getTransactionsForQuality: async () => [
        { id: 1, basiq_id: 'txn-1', amount: -20, post_date: '2026-07-01' },
      ],
      listBasiqAccountsForQuality: async () => [
        { id: 2, source: 'basiq', account_reference: 'basiq:2', balance: 100, updated_at: '2026-07-29T00:00:00Z' },
      ],
      syncFindings: async (_userId, findings) => {
        receivedFindings = findings;
        return { findings: 0, counts: { error: 0, warning: 0, info: 0 }, status: 'healthy' };
      },
      getDataHealth: async () => null,
      recordDataQualityFailure: async () => null,
    });
    const result = await service.run(8, { now: '2026-07-30T00:00:00Z' });
    assert.deepStrictEqual(receivedFindings, []);
    assert.equal(result.status, 'healthy');
  });

  await test('health reads remain scoped to the supplied user', async () => {
    const service = createDataQualityService({
      getTransactionsForQuality: async () => [],
      listBasiqAccountsForQuality: async () => [],
      syncFindings: async () => null,
      getDataHealth: async (userId) => ({ userId, status: 'healthy' }),
      recordDataQualityFailure: async () => null,
    });
    assert.deepStrictEqual(await service.getHealth(42), { userId: 42, status: 'healthy' });
  });

  await test('partial import coverage is passed to persistence and remains visible', async () => {
    let persistedOptions;
    let persistedChecks;
    const service = createDataQualityService({
      getTransactionsForQuality: async () => [],
      listBasiqAccountsForQuality: async () => [],
      syncFindings: async (_userId, _findings, checks, options) => {
        persistedChecks = checks;
        persistedOptions = options;
        return { findings: 0, counts: { error: 0, warning: 0, info: 0 }, status: 'incomplete' };
      },
      getDataHealth: async () => null,
      recordDataQualityFailure: async () => null,
    });
    const result = await service.run(9, {
      coverage: { accounts: 'complete', transactions: 'failed' },
      message: 'Transaction import failed',
    });
    assert.equal(result.status, 'incomplete');
    assert.deepStrictEqual(persistedOptions.coverage, { accounts: 'complete', transactions: 'failed' });
    assert.equal(persistedOptions.message, 'Transaction import failed');
    assert(persistedChecks.every((code) => code.startsWith('account.')));
    assert(!persistedChecks.some((code) => code.startsWith('transaction.')));
  });

  await test('failed quality runs are recorded for the same user', async () => {
    let recorded;
    const service = createDataQualityService({
      getTransactionsForQuality: async () => [],
      listBasiqAccountsForQuality: async () => [],
      syncFindings: async () => null,
      getDataHealth: async () => null,
      recordDataQualityFailure: async (userId, options) => { recorded = { userId, options }; },
    });
    await service.recordFailure(10, { trigger: 'basiq_sync', message: 'database unavailable' });
    assert.deepStrictEqual(recorded, {
      userId: 10,
      options: { trigger: 'basiq_sync', message: 'database unavailable' },
    });
  });

  await test('status is critical for errors, attention for warnings, otherwise healthy', async () => {
    assert.equal(statusForCounts({ error: 1, warning: 0 }), 'critical');
    assert.equal(statusForCounts({ error: 0, warning: 1 }), 'attention');
    assert.equal(statusForCounts({ error: 0, warning: 0 }), 'healthy');
  });

  console.log(`\n${passed} data-quality service tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
