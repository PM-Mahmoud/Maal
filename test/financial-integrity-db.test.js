// Opt-in PostgreSQL contract test. It deliberately refuses non-local or
// non-test databases because it recreates the public schema.
const assert = require('assert');
const { Pool } = require('pg');
const migration = require('../migrations/1753900000000_financial_integrity');
const runsMigration = require('../migrations/1754000000000_data_quality_runs');
const reconciliationMigration = require('../migrations/1754100000000_account_reconciliation');
const lineageMigration = require('../migrations/1754200000000_calculation_lineage');

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
    await pool.query(`
      CREATE TABLE linked_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        institution_name TEXT, institution_type TEXT, account_reference TEXT, balance NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE cash_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, institution TEXT, balance BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE investments (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT, kind TEXT, value BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE debts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, kind TEXT, balance BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE super_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        label TEXT, fund_name TEXT, balance BIGINT, source TEXT, account_reference TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE transactions (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        basiq_id TEXT UNIQUE, description TEXT, amount NUMERIC, status TEXT,
        post_date DATE, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await migration.up(pool);
    await runsMigration.up(pool);
    await reconciliationMigration.up(pool);
    await lineageMigration.up(pool);

    const firstUser = (await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
    const secondUser = (await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
    const ownedTransaction = (await pool.query(
      `INSERT INTO transactions (user_id, basiq_id, amount, post_date)
       VALUES ($1, 'owned', 1, '2026-07-01') RETURNING id`,
      [firstUser]
    )).rows[0].id;
    await expectPgError(
      () => pool.query(
        `INSERT INTO transaction_provider_details
           (transaction_id, user_id, account_reference, balance_after)
         VALUES ($1, $2, 'basiq:a1', 10)`,
        [ownedTransaction, secondUser]
      ),
      'P0001'
    );
    await pool.query('DELETE FROM transactions WHERE id = $1', [ownedTransaction]);

    delete require.cache[require.resolve('../db/transactions')];
    const transactionDb = require('../db/transactions');
    await transactionDb.upsertBasiqTransactions(firstUser, [{
      id: 'stale-link', amount: 1, postDate: '2026-07-01T01:00:00Z',
      account: 'a1', balance: 10,
    }]);
    await transactionDb.upsertBasiqTransactions(firstUser, [{
      id: 'stale-link', amount: 1, postDate: '2026-07-01T01:00:00Z',
    }]);
    const staleDetails = await pool.query(
      `SELECT 1 FROM transaction_provider_details d
        JOIN transactions t ON t.id = d.transaction_id
       WHERE t.basiq_id = 'stale-link'`
    );
    assert.equal(staleDetails.rowCount, 0, 'removed provider account links must not remain as evidence');
    await pool.query(`DELETE FROM transactions WHERE basiq_id = 'stale-link'`);

    await pool.query(
      `INSERT INTO linked_accounts
         (user_id, institution_name, account_reference, balance)
       VALUES ($1, 'Preserve', 'basiq:a-bad', 50),
              ($1, 'Gone', 'basiq:gone', 60)`,
      [firstUser]
    );
    await pool.query(
      `INSERT INTO cash_accounts
         (user_id, label, balance, source, account_reference)
       VALUES ($1, 'Preserve', 50, 'basiq', 'basiq:a-bad'),
              ($1, 'Gone', 60, 'basiq', 'basiq:gone')`,
      [firstUser]
    );
    global.__maalPool = pool;
    delete require.cache[require.resolve('../db/pool')];
    delete require.cache[require.resolve('../db/basiq-import')];
    const basiqImport = require('../db/basiq-import');
    await basiqImport.replaceBasiqAccounts(firstUser, [{
      linked: {
        institution_name: 'Good', institution_type: 'bank',
        account_reference: 'basiq:good', balance: 100,
      },
      bucket: 'cash',
      row: {
        label: 'Good', institution: 'Good', balance: 100,
        account_reference: 'basiq:good',
      },
    }], ['basiq:a-bad']);
    const accountRefs = (await pool.query(
      'SELECT account_reference FROM cash_accounts WHERE user_id = $1 ORDER BY account_reference',
      [firstUser]
    )).rows.map((row) => row.account_reference);
    assert.deepStrictEqual(accountRefs, ['basiq:a-bad', 'basiq:good']);

    await assert.rejects(
      () => basiqImport.replaceBasiqAccounts(firstUser, [{
        linked: {
          institution_name: 'Broken', institution_type: 'bank',
          account_reference: 'basiq:broken', balance: 1,
        },
        bucket: 'unsupported',
        row: {},
      }]),
      /Unsupported Basiq account bucket/
    );
    const refsAfterRollback = (await pool.query(
      'SELECT account_reference FROM cash_accounts WHERE user_id = $1 ORDER BY account_reference',
      [firstUser]
    )).rows.map((row) => row.account_reference);
    assert.deepStrictEqual(refsAfterRollback, accountRefs, 'failed replacement must roll back atomically');

    const reconciliationTxns = (await pool.query(
      `INSERT INTO transactions (user_id, basiq_id, amount, status, post_date)
       VALUES ($1, 'recon-1', 10, 'posted', '2026-07-01'),
              ($1, 'recon-2', 20, 'posted', '2026-07-02')
       RETURNING id, basiq_id`,
      [firstUser]
    )).rows;
    await pool.query(
      `INSERT INTO transaction_provider_details
         (transaction_id, user_id, account_reference, balance_after)
       VALUES ($1, $3, 'basiq:good', 80),
              ($2, $3, 'basiq:good', 100)`,
      [reconciliationTxns[0].id, reconciliationTxns[1].id, firstUser]
    );
    delete require.cache[require.resolve('../db/reconciliation')];
    delete require.cache[require.resolve('../services/reconciliation')];
    const reconciliationService = require('../services/reconciliation');
    const reconciliationRows = await reconciliationService.reconcileAccounts(firstUser);
    assert.equal(
      reconciliationRows.find((row) => row.account_reference === 'basiq:good').status,
      'matched'
    );
    await expectPgError(
      () => pool.query(
        `INSERT INTO account_reconciliations
           (user_id, account_reference, status, anchor_transaction_id)
         VALUES ($2, 'basiq:foreign-anchor', 'matched', $1)`,
        [reconciliationTxns[0].id, secondUser]
      ),
      'P0001'
    );
    await pool.query('DELETE FROM transactions WHERE basiq_id IN ($1, $2)', ['recon-1', 'recon-2']);
    const clearedAnchor = await pool.query(
      `SELECT anchor_transaction_id FROM account_reconciliations
        WHERE user_id = $1 AND account_reference = 'basiq:good'`,
      [firstUser]
    );
    assert.equal(clearedAnchor.rows[0].anchor_transaction_id, null);
    await pool.query(
      `INSERT INTO data_quality_runs
         (user_id, trigger, status, warning_count)
       VALUES ($1, 'basiq_sync', 'attention', 1)`,
      [firstUser]
    );
    await pool.query(
      `INSERT INTO data_quality_runs
         (user_id, trigger, status, coverage)
       VALUES ($1, 'manual', 'healthy', '{"accounts":"complete","transactions":"complete"}'),
              ($2, 'basiq_sync', 'failed', '{"accounts":"failed"}')`,
      [firstUser, secondUser]
    );
    await pool.query(
      `INSERT INTO data_quality_findings
         (user_id, check_code, entity_type, entity_key, severity, summary)
       VALUES ($1, 'account.stale', 'account', 'own', 'warning', 'Own finding'),
              ($2, 'account.stale', 'account', 'other', 'error', 'Other user finding')`,
      [firstUser, secondUser]
    );

    global.__authPool = pool;
    delete require.cache[require.resolve('../db/auth')];
    delete require.cache[require.resolve('../db/financial-integrity')];
    const health = await require('../db/financial-integrity').getDataHealth(firstUser);
    assert.equal(health.status, 'healthy', 'latest run wins for the scoped user');
    assert.deepStrictEqual(health.coverage, { accounts: 'complete', transactions: 'complete' });
    assert.equal(health.findings.length, 1);
    assert.equal(health.findings[0].entity_key, 'own', 'other users findings must never leak');

    delete require.cache[require.resolve('../db/transactions')];
    const transactionsDb = require('../db/transactions');
    await assert.rejects(
      () => transactionsDb.upsertBasiqTransactions(firstUser, [
        { id: 'valid-first', amount: 1, postDate: '2026-07-01' },
        { id: 'invalid-second', amount: 2, postDate: 'not-a-date' },
      ])
    );
    assert.equal(
      Number((await pool.query('SELECT COUNT(*) AS count FROM transactions WHERE user_id = $1', [firstUser])).rows[0].count),
      0,
      'a failed Basiq transaction batch must roll back every row'
    );
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
    await pool.query(
      `INSERT INTO calculation_audits
         (user_id, calculation_type, calculation_version, effective_at, inputs, assumptions, result)
       VALUES ($1, 'net_worth', '1', NOW(), '{"assets_total":100}', '{}', '{"net_worth":90}'),
              ($1, 'maal_score', '1', NOW(), '{"annual_income":100}', '{}', '{"score":70}'),
              ($1, 'cash_flow', '1', NOW(), '{"transaction_count":2}', '{}', '{"net_cash_flow":10}'),
              ($1, 'investment_metrics', '1', NOW(), '{"holding_count":1}', '{}', '{"current_value":20}')`,
      [firstUser]
    );
    const integrityDb = require('../db/financial-integrity');
    const firstCalculationId = await integrityDb.recordCalculation(firstUser, {
      type: 'net_worth',
      version: 'dedupe-test',
      effectiveAt: '2026-07-30T01:00:00Z',
      inputs: { assets_total: 100 },
      result: { net_worth: 90 },
    });
    const repeatedCalculationId = await integrityDb.recordCalculation(firstUser, {
      type: 'net_worth',
      version: 'dedupe-test',
      effectiveAt: '2026-07-30T20:00:00Z',
      inputs: { assets_total: 100 },
      result: { net_worth: 90 },
    });
    assert.equal(
      repeatedCalculationId,
      firstCalculationId,
      'identical calculations on the same effective date must be idempotent'
    );
    const changedCalculationId = await integrityDb.recordCalculation(firstUser, {
      type: 'net_worth',
      version: 'dedupe-test',
      effectiveAt: '2026-07-30T21:00:00Z',
      inputs: { assets_total: 101 },
      result: { net_worth: 91 },
    });
    assert.notEqual(
      changedCalculationId,
      firstCalculationId,
      'changed same-day inputs must create distinct lineage'
    );
    const ownLineage = await integrityDb.listCalculationLineage(firstUser, { limit: 10 });
    assert.deepStrictEqual(
      new Set(ownLineage.map((row) => row.calculation_type)),
      new Set(['net_worth', 'maal_score', 'cash_flow', 'investment_metrics'])
    );
    assert.equal(
      ownLineage.some((row) => row.id === audit),
      false,
      'calculation lineage must never include another user'
    );
    const scoreOnly = await integrityDb.listCalculationLineage(firstUser, {
      type: 'maal_score',
      limit: 10,
    });
    assert.deepStrictEqual(scoreOnly.map((row) => row.calculation_type), ['maal_score']);
    await expectPgError(
      () => pool.query(
        `UPDATE calculation_audits SET result = '{}' WHERE id = $1`,
        [ownLineage[0].id]
      ),
      'P0001'
    );
    await expectPgError(
      () => pool.query('DELETE FROM calculation_audits WHERE id = $1', [ownLineage[0].id]),
      'P0001'
    );
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
    assert.equal(
      Number((await pool.query('SELECT COUNT(*) AS count FROM data_quality_runs WHERE user_id = $1', [firstUser])).rows[0].count),
      0,
      'account erasure must cascade to quality-run history'
    );

    console.log('✓ financial-integrity PostgreSQL contract passed');
  } finally {
    delete global.__authPool;
    delete global.__maalPool;
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
