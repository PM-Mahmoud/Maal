const assert = require('assert');
const {
  createEnqueueBasiqImportHandler,
  createGetImportRunHandler,
  createSaveBasiqOwnershipHandler,
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

  const ownerBody = { owner_type: 'joint', import_run_id: '3', account_references: ['basiq:demo-a', 'basiq:demo-a'] };
  let updates = 0;
  const saveOwner = createSaveBasiqOwnershipHandler(async (userId, runId, refs, owner) => {
    updates++;
    assert.equal(runId, '3');
    assert.deepEqual(refs, ['basiq:demo-a']);
    assert.equal(owner, 'joint');
    return userId === 42 ? { saved: 1, retained: 0 } : null;
  });
  const unauthenticated = response();
  await saveOwner({ session: {}, body: ownerBody }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const invalid = response();
  await saveOwner({ session: { userId: 42 }, body: { ...ownerBody, owner_type: 'company' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(updates, 0);
  const foreign = response();
  await saveOwner({ session: { userId: 7 }, body: ownerBody }, foreign);
  assert.equal(foreign.statusCode, 404);
  const saved = response();
  await saveOwner({ session: { userId: 42 }, body: { ...ownerBody, user_id: 7 } }, saved);
  assert.deepEqual(saved.body, { saved: 1, retained: 0 });

  const pool = require('../db/pool');
  const { setBasiqOwnerType } = require('../db/basiq-account-ownership');
  const previousConnect = pool.connect;
  const statements = [];
  pool.connect = async () => ({
    query: async (sql, params = []) => {
      statements.push(sql);
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return {};
      assert.equal(params[0], 42, 'every ownership query must be scoped to the user');
      if (sql.includes('FROM import_runs')) return { rows: [{ id: 3 }] };
      if (sql.includes('FROM linked_accounts')) {
        assert.match(sql, /WHERE user_id = \$1/);
        const rows = params[1].includes('basiq:demo-a') ? [{ account_reference: 'basiq:demo-a' }] : [];
        return { rows };
      }
      if (sql.includes('FROM canonical_account_links')) return { rows: [{ id: 5, status: 'active' }] };
      if (sql.includes('INSERT INTO ownership_interests')) {
        assert.match(sql, /legacy_key IS DISTINCT FROM \$4/);
        assert.match(sql, /ownership_interests\.effective_to IS NULL/);
        assert.deepEqual(params, [42, 'financial_account:5', 'joint', 'basiq:demo-a:ownership']);
        return { rowCount: 1 };
      }
      assert.fail(sql);
    },
    release() {},
  });
  try {
    assert.equal(await setBasiqOwnerType(42, '3', ['basiq:not-mine'], 'joint'), null);
    assert.ok(!statements.some((sql) => sql.includes('INSERT INTO ownership_interests')));
    assert.deepEqual(await setBasiqOwnerType(42, '3', ['basiq:demo-a'], 'joint'), { saved: 1, retained: 0 });
  } finally {
    pool.connect = previousConnect;
  }

  console.log('✓ import enqueue and progress APIs are idempotent and tenant-scoped');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
