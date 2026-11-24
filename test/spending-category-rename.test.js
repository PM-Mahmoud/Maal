'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../db/pool');
const { updateCustomCategory, updateGroup } = require('../db/spending-categories');

function fixture(t, answers) {
  const queries = [];
  let released = false;
  t.mock.method(pool, 'connect', async () => ({
    async query(sql, values) {
      queries.push({ sql, values });
      return answers(sql, values);
    },
    release() { released = true; },
  }));
  return { queries, released: () => released };
}

test('renaming a category updates the caller’s budget, transactions, splits, saved suggestions, recurring items and group membership together', async (t) => {
  const updated = { id: '7', name: 'Pets', color: '#1476D3', icon: 'dog' };
  const db = fixture(t, (sql) => ({
    rows: sql.startsWith('SELECT id, name FROM spending_custom_categories')
      ? [{ id: '7', name: 'Pet care' }]
      : sql.startsWith('UPDATE spending_custom_categories') ? [updated] : [],
  }));

  assert.deepEqual(await updateCustomCategory('7', 91, { name: 'Pets', color: '#1476D3', icon: 'dog' }), updated);
  assert.equal(db.queries[0].sql, 'BEGIN');
  assert.deepEqual(db.queries[1].values, ['7', 91]);
  assert.match(db.queries[1].sql, /AND user_id = \$2 FOR UPDATE/);
  assert.deepEqual(db.queries[2].values, ['7', 91, 'Pets', null, '#1476D3', 'dog']);
  const references = db.queries.slice(3, -1);
  assert.deepEqual(references.map(({ sql }) => sql.split(' ')[1]), [
    'budgets', 'transaction_categories', 'transaction_splits',
    'transaction_category_feedback', 'recurring_items', 'spending_category_group_members',
  ]);
  for (const { sql, values } of references) {
    assert.match(sql, /WHERE user_id = \$1 AND category_(?:group|name) = \$2/);
    assert.deepEqual(values, [91, 'Pet care', 'Pets']);
  }
  assert.equal(db.queries.at(-1).sql, 'COMMIT');
  assert.equal(db.released(), true);
});

test('renaming a group carries only its name and leaves memberships intact', async (t) => {
  const updated = { id: '2', name: 'Activities', color: '#4E6E94' };
  const db = fixture(t, (sql) => ({ rows: sql.startsWith('UPDATE spending_category_groups') ? [updated] : [] }));

  assert.deepEqual(await updateGroup('2', 91, { name: 'Activities' }), updated);
  assert.equal(db.queries.length, 3);
  assert.match(db.queries[1].sql, /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(db.queries[1].values, ['2', 91, 'Activities', null, null]);
  assert.equal(db.queries.at(-1).sql, 'COMMIT');
  assert.equal(db.released(), true);
});
