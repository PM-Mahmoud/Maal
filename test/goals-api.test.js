'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const goalsDb = require('../db/goals');
const router = require('../routes/api');

const post = router.stack.find(({ route }) => route?.path === '/v1/goals' && route.methods.post).route.stack[0].handle;

async function postGoal(body, userId = 7) {
  let status = 200;
  let data;
  await post({ session: { userId }, body }, {
    status(code) { status = code; return this; },
    json(value) { data = value; },
  });
  return { status, data };
}

test('POST goals rejects unknown fields before either write and preserves session-scoped upserts', async (t) => {
  const goal = { name: 'Trip', target_amount: 5000 };
  const create = t.mock.method(goalsDb, 'createGoal', async () => goal);
  const update = t.mock.method(goalsDb, 'updateGoal', async () => goal);

  assert.deepEqual(await postGoal({ ...goal, foo: 1, user_id: 3 }), {
    status: 400,
    data: { error: 'Unknown fields on goals.', unknown_fields: ['foo', 'user_id'] },
  });
  assert.equal((await postGoal({ ...goal, id: 22, foo: 1 })).status, 400);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);

  assert.deepEqual(await postGoal(goal), { status: 200, data: goal });
  assert.deepEqual(create.mock.calls[0].arguments, [7, goal]);
  const edit = { ...goal, id: 22, source_type: 'manual', current_amount: 25 };
  assert.deepEqual(await postGoal(edit), { status: 200, data: goal });
  assert.deepEqual(update.mock.calls[0].arguments, [22, 7, edit]);
});
