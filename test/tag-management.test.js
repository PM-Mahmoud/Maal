'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { pool } = require('../db/auth');
const api = require('../routes/api');

const handler = api.stack.find(({ route }) => route?.path === '/v1/tags/:id' && route.methods.patch).route.stack[0].handle;

async function patchTag(body, { id = '7', userId = 12 } = {}) {
  let status = 200;
  let data;
  await handler({ body, params: { id }, session: { userId } }, {
    status(code) { status = code; return this; },
    json(value) { data = value; },
  });
  return { status, data };
}

test('PATCH tags authenticates and validates before querying the database', async (t) => {
  const query = t.mock.method(pool, 'query', () => assert.fail('validation should run before SQL'));
  assert.equal((await patchTag({ name: 'A' }, { userId: null })).status, 401);
  assert.equal((await patchTag({ name: 'A' }, { id: 'oops' })).status, 404);
  for (const body of [{}, { name: '  ' }, { name: 'x'.repeat(41) }, { color: null }, { color: 'red' }, { user_id: 13 }]) {
    assert.equal((await patchTag(body)).status, 400);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('PATCH tags normalises the name, preserves omitted fields, and scopes edits and usage counts to the caller', async (t) => {
  t.mock.method(pool, 'query', async (sql, values) => {
    assert.match(sql, /WHERE g\.user_id = \$1 AND g\.id = \$2/);
    assert.match(sql, /tt\.tag_id = g\.id AND tt\.user_id = \$1/);
    assert.deepEqual(values.slice(1), ['7', 'Work travel', null]);
    return { rows: values[0] === 12
      ? [{ id: 7, name: 'Work travel', color: 'sage', uses: 2 }]
      : [] };
  });
  assert.deepEqual(await patchTag({ name: ' Work  travel ' }), {
    status: 200,
    data: { tag: { id: '7', name: 'Work travel', color: 'sage', uses: 2 } },
  });
  assert.equal((await patchTag({ name: ' Work  travel ' }, { userId: 13 })).status, 404);
});

test('PATCH tags reports a conflict when a tag already has the requested name', async (t) => {
  t.mock.method(pool, 'query', async () => { throw Object.assign(new Error('duplicate name'), { code: '23505' }); });
  assert.equal((await patchTag({ name: 'Work travel', color: 'clay' })).status, 409);
});
