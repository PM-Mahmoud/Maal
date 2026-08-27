'use strict';

const assert = require('assert');
const { createProviderImportHandler } = require('../services/provider-import-job');

(async () => {
  const events = [];
  const handler = createProviderImportHandler({
    provider: 'lunchflow',
    sync: async (_userId, options) => { await options.onProgress('accounts', { imported: 2 }); return { accounts: 2, transactions: 5 }; },
    imports: {
      startImportRun: async () => ({ status: 'running' }),
      withImportFence: async (_r, _u, _a, mutation) => mutation(),
      updateImportProgress: async () => events.push('progress'),
      completeImportRun: async () => events.push('complete'),
      failImportRun: async () => events.push('fail'),
    },
    healthStore: {
      upsertHealth: async (_userId, provider, patch) => events.push(`${provider}:${patch.status}`),
      getHealth: async () => null,
    },
    eventStore: { recordEvent: async (_u, _p, type) => events.push(type) },
  });
  const result = await handler({ id: 2, attempts: 1, max_attempts: 3, locked_by: 'worker', attempt_token: 'token', payload: { import_run_id: 8, user_id: 42 } }, { heartbeat: async () => events.push('heartbeat') });
  assert.deepStrictEqual(result, { import_run_id: 8, accounts: 2, transactions: 5 });
  assert.deepStrictEqual(events, ['heartbeat', 'progress', 'complete', 'lunchflow:healthy', 'sync_succeeded']);

  let failureHealth;
  const failing = createProviderImportHandler({
    provider: 'lunchflow', sync: async () => { const error = new Error('token revoked'); error.status = 401; throw error; },
    imports: { startImportRun: async () => ({ status: 'running' }), withImportFence: async (_r, _u, _a, mutation) => mutation(), failImportRun: async () => null },
    healthStore: { getHealth: async () => ({ consecutive_failures: 1 }), upsertHealth: async (_u, _p, patch) => { failureHealth = patch; } },
    eventStore: { recordEvent: async () => null },
  });
  await assert.rejects(() => failing({ id: 3, attempts: 3, max_attempts: 3, locked_by: 'worker', attempt_token: 'token', payload: { import_run_id: 9, user_id: 42 } }), /revoked/);
  assert.equal(failureHealth.status, 'reauthorization_required');
  assert.equal(failureHealth.consecutiveFailures, 2);

  console.log('✓ provider imports are durable, progress-aware, and update connection health');
})().catch((error) => { console.error(error); process.exit(1); });
