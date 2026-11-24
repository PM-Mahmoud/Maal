'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { up } = require('../migrations/1750300000000_knowledge_chunks');

function database({ installed = false, extensionError } = {}) {
  const statements = [];
  let failed = false;
  return {
    statements,
    async query(sql) {
      const query = sql.trim();
      if (query.startsWith('ROLLBACK TO SAVEPOINT')) failed = false;
      assert.equal(failed, false, 'a failed statement must be rolled back before more SQL runs');
      statements.push(query);
      if (query.startsWith('SELECT EXISTS')) return { rows: [{ installed }] };
      if (query.startsWith('CREATE EXTENSION') && extensionError) {
        failed = true;
        throw Object.assign(new Error('extension setup failed'), { code: extensionError });
      }
    },
  };
}

test('existing pgvector preserves the vector column and HNSW index', async () => {
  const db = database({ installed: true });
  await up(db);
  assert.match(db.statements.join('\n'), /embedding\s+vector\(1536\)/);
  assert.match(db.statements.join('\n'), /USING hnsw/);
  assert.ok(!db.statements.some((sql) => sql.startsWith('CREATE EXTENSION')));
});

test('available pgvector is enabled for a fresh database', async () => {
  const db = database();
  await up(db);
  assert.ok(db.statements.includes('CREATE EXTENSION IF NOT EXISTS vector'));
  assert.match(db.statements.join('\n'), /USING hnsw/);
});

test('unavailable pgvector rolls back to its savepoint and keeps the metadata schema', async (t) => {
  const log = t.mock.method(console, 'warn', () => {});
  const db = database({ extensionError: '0A000' });
  await up(db);
  const sql = db.statements.join('\n');
  assert.match(sql, /ROLLBACK TO SAVEPOINT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS knowledge_chunks/);
  assert.match(sql, /knowledge_chunks_category_idx/);
  assert.doesNotMatch(sql, /vector\(1536\)|USING hnsw/);
  assert.equal(log.mock.callCount(), 1);
});

test('unexpected failures still fail the migration', async () => {
  const db = database({ extensionError: '08006' });
  await assert.rejects(up(db), { code: '08006' });
  assert.ok(!db.statements.some((sql) => sql.startsWith('CREATE TABLE')));
});
