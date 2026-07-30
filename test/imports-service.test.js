const assert = require('assert');
const {
  createEnqueueBasiqImportHandler,
  createGetImportRunHandler,
} = require('../services/imports');

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  let enqueued;
  const db = {
    enqueueImportRun: async (userId, options) => {
      enqueued = { userId, options };
      return { run: { id: 3, status: 'queued' }, job: { id: 4 } };
    },
    getImportRunForUser: async (id, userId) => (
      id === '3' && userId === 42 ? { id: 3, status: 'running' } : null
    ),
  };
  const enqueue = createEnqueueBasiqImportHandler(db);
  const queued = response();
  await enqueue({
    session: { userId: 42 },
    get: (name) => (name === 'Idempotency-Key' ? 'request-123' : null),
  }, queued);
  assert.equal(queued.statusCode, 202);
  assert.deepStrictEqual(enqueued, {
    userId: 42,
    options: { provider: 'basiq', requestKey: 'request-123' },
  });

  const getRun = createGetImportRunHandler(db);
  const found = response();
  await getRun({ session: { userId: 42 }, params: { id: '3' } }, found);
  assert.equal(found.body.import_run.status, 'running');
  const hidden = response();
  await getRun({ session: { userId: 7 }, params: { id: '3' } }, hidden);
  assert.equal(hidden.statusCode, 404);

  console.log('✓ import enqueue and progress APIs are idempotent and tenant-scoped');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
