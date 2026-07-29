// Opt-in PostgreSQL contract test. It deliberately refuses non-local or
// non-test databases because it recreates the public schema.
const assert = require('assert');
const { Pool } = require('pg');
const migration = require('../migrations/1753900000000_financial_integrity');

async function expectPgError(fn, expectedCode) {
  let error;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `Expected PostgreSQL error ${expectedCode}`);
  assert.equal(error.code, expectedCode);
}

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Refusing to run: DATABASE_URL must target a local database ending in _test');
  }

  const pool = new Pool({ connectionString: url.toString() });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.query('CREATE TABLE users (id BIGSERIAL PRIMARY KEY)');
    await migration.up(pool);

    const firstUser = (await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
    const secondUser = (await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
    const raw = (await pool.query(
      `INSERT INTO raw_financial_records
         (user_id, source, entity_type, source_record_id, payload, payload_hash)
       VALUES ($1, 'basiq', 'transaction', 'txn-1', '{"amount":10}', 'hash-1')
       RETURNING id`,
      [firstUser]
    )).rows[0].id;

    await expectPgError(
      () => pool.query('UPDATE raw_financial_records SET payload = $1 WHERE id = $2', ['{}', raw]),
      'P0001'
    );
    await expectPgError(
      () => pool.query('DELETE FROM raw_financial_records WHERE id = $1', [raw]),
      'P0001'
    );

    const audit = (await pool.query(
      `INSERT INTO calculation_audits
         (user_id, calculation_type, calculation_version, effective_at, inputs, result)
       VALUES ($1, 'net_worth', '1', NOW(), '{}', '{}') RETURNING id`,
      [secondUser]
    )).rows[0].id;
    await expectPgError(
      () => pool.query(
        `INSERT INTO calculation_audit_sources
           (calculation_audit_id, raw_record_id, user_id) VALUES ($1, $2, $3)`,
        [audit, raw, secondUser]
      ),
      '23503'
    );

    await pool.query('DELETE FROM users WHERE id = $1', [firstUser]);
    assert.equal(
      Number((await pool.query('SELECT COUNT(*) AS count FROM raw_financial_records WHERE id = $1', [raw])).rows[0].count),
      0,
      'account erasure must cascade to raw evidence'
    );

    console.log('✓ financial-integrity PostgreSQL contract passed');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
