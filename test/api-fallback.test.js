'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../routes/api');
const pool = require('../db/pool');

const tableHandler = router.stack.find(({ route }) => route?.path === '/v1/:table').route.stack[0].handle;
const fallbackHandler = router.stack.find(({ route }) => Array.isArray(route?.path) && route.path.includes('/v1/*')).route.stack[0].handle;

async function call(handler, request) {
  const response = { statusCode: 200, body: undefined };
  await handler(request, {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; },
  });
  return response;
}

test('the generic handler authenticates before resolving a table', async () => {
  const request = { method: 'GET', params: { table: 'unlisted_table' } };
  assert.deepEqual(await call(tableHandler, request), {
    statusCode: 401, body: { error: 'Not authenticated' },
  });
  assert.deepEqual(await call(tableHandler, { ...request, session: { userId: 7 } }), {
    statusCode: 404, body: { error: 'Not found' },
  });
});

test('the nested API fallback follows the same 401 and 404 contract', async () => {
  const request = { method: 'GET', session: {} };
  assert.deepEqual(await call(fallbackHandler, request), {
    statusCode: 401, body: { error: 'Not authenticated' },
  });
  assert.deepEqual(await call(fallbackHandler, { ...request, session: { userId: 7 } }), {
    statusCode: 404, body: { error: 'Not found' },
  });
});

test('a generic GET stays owner-scoped and reports database errors', async (t) => {
  const request = { method: 'GET', params: { table: 'cash_accounts' }, session: { userId: 7 }, query: {} };
  const query = t.mock.method(pool, 'query', async (sql, values) => {
    assert.match(sql, /WHERE user_id = \$1/);
    assert.deepEqual(values, [7]);
    return { rows: [{ id: 12 }] };
  });
  assert.deepEqual(await call(tableHandler, request), { statusCode: 200, body: [{ id: 12 }] });
  query.mock.mockImplementation(async () => { throw new Error('Fixture database error'); });
  const errorLog = t.mock.method(console, 'error', () => {});
  assert.deepEqual(await call(tableHandler, request), {
    statusCode: 500, body: { error: 'An internal error occurred' },
  });
  assert.equal(errorLog.mock.callCount(), 1);
});
