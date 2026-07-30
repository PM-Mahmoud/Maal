const assert = require('assert');
const { createBasiqImportHandler } = require('../services/basiq-import-job');

(async () => {
  const events = [];
  const handler = createBasiqImportHandler({
    imports: {
      startImportRun: async (...args) => {
        events.push(['start', ...args]);
        return { status: 'running', checkpoints: {} };
      },
      withImportFence: async (_runId, _userId, _attempt, mutation) => mutation(),
      updateImportProgress: async (...args) => events.push(['progress', ...args]),
      completeImportRun: async (...args) => events.push(['complete', ...args]),
      failImportRun: async (...args) => events.push(['fail', ...args]),
    },
    sync: async (userId, options) => {
      assert.equal(userId, 7);
      await options.onProgress('accounts', { imported: 2 });
      await options.onProgress('transactions', { imported: 4 });
      return { accounts: 2, transactions: 4 };
    },
  });
  let heartbeats = 0;
  const result = await handler(
    {
      id: 20, attempts: 1, max_attempts: 3, locked_by: 'worker',
      payload: { import_run_id: 9, user_id: 7 },
    },
    { heartbeat: async () => { heartbeats++; }, signal: new AbortController().signal }
  );
  assert.deepStrictEqual(result, {
    import_run_id: 9, accounts: 2, transactions: 4,
  });
  assert.equal(heartbeats, 2);
  assert.deepStrictEqual(events.map((event) => event[0]), [
    'start', 'progress', 'progress', 'complete',
  ]);

  let failed;
  const failing = createBasiqImportHandler({
    imports: {
      startImportRun: async () => ({ status: 'running', checkpoints: {} }),
      withImportFence: async (_runId, _userId, _attempt, mutation) => mutation(),
      failImportRun: async (...args) => { failed = args; },
    },
    sync: async () => { throw new Error('provider unavailable'); },
  });
  await assert.rejects(
    () => failing(
      {
        id: 21, attempts: 1, max_attempts: 3, locked_by: 'worker',
        payload: { import_run_id: 10, user_id: 8 },
      },
      { heartbeat: async () => null, signal: new AbortController().signal }
    ),
    /provider unavailable/
  );
  assert.equal(failed[0], 10);
  assert.equal(failed[1], 8);

  console.log('✓ Basiq import jobs persist progress, completion, and retryable failure state');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
