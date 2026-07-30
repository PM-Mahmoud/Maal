'use strict';

// test/basiq-sync.test.js
// Deterministic tests for the Basiq sync mapping contract (specs/basiq-sync.md)
// and the basiqFetch error-handling contract. No network, no DB — everything
// here mocks global.fetch or calls pure functions directly.

const assert = require('assert');
const {
  mapBasiqAccount, mapBasiqTransaction, shapeBasiqAssetRow, basiqAccountReference,
} = require('../lib/basiq-mapping');
const { classifyAccountType } = require('../lib/connected');
const {
  providerRecordKey, rawAccountProjection, rawTransactionProjection,
  invalidEntityKeys, createBasiqSyncService,
} = require('../services/basiq-sync');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// ─── mapBasiqAccount ───
console.log('\nmapBasiqAccount');

test('account_reference is always basiq:<id>', () => {
  const r = mapBasiqAccount({ id: 'acc-123', institution: 'HoolibankAU', balance: 100 });
  assert.strictEqual(r.account_reference, 'basiq:acc-123');
});

test('institution_name strips literal AU substring', () => {
  const r = mapBasiqAccount({ id: '1', institution: 'HoolibankAU', balance: 0 });
  assert.strictEqual(r.institution_name, 'Hoolibank');
});

test('institution_name falls back to acc.name when institution absent', () => {
  const r = mapBasiqAccount({ id: '1', name: 'Everyday Saver', balance: 0 });
  assert.strictEqual(r.institution_name, 'Everyday Saver');
});

test('institution_name falls back to "Bank account" when both absent', () => {
  const r = mapBasiqAccount({ id: '1', balance: 0 });
  assert.strictEqual(r.institution_name, 'Bank account');
});

test('institution_type uses class.type when present', () => {
  const r = mapBasiqAccount({ id: '1', balance: 0, class: { type: 'savings' } });
  assert.strictEqual(r.institution_type, 'savings');
});

test('institution_type defaults to "bank" when class absent', () => {
  const r = mapBasiqAccount({ id: '1', balance: 0 });
  assert.strictEqual(r.institution_type, 'bank');
});

test('balance preserves provider cents', () => {
  const r = mapBasiqAccount({ id: '1', balance: 1234.789 });
  assert.strictEqual(r.balance, 1234.789);
});

test('balance coerces non-numeric string to 0', () => {
  const r = mapBasiqAccount({ id: '1', balance: 'not-a-number' });
  assert.strictEqual(r.balance, 0);
});

test('balance coerces missing balance to 0', () => {
  const r = mapBasiqAccount({ id: '1' });
  assert.strictEqual(r.balance, 0);
});

test('balance never returns NaN', () => {
  const r = mapBasiqAccount({ id: '1', balance: NaN });
  assert.ok(!Number.isNaN(r.balance));
});

// ─── mapBasiqTransaction ───
console.log('\nmapBasiqTransaction');

test('returns null when id is missing', () => {
  assert.strictEqual(mapBasiqTransaction({ description: 'no id' }), null);
});

test('returns null when txn itself is falsy', () => {
  assert.strictEqual(mapBasiqTransaction(null), null);
  assert.strictEqual(mapBasiqTransaction(undefined), null);
});

test('post_date takes first 10 chars of postDate', () => {
  const r = mapBasiqTransaction({ id: 't1', postDate: '2026-06-15T00:00:00Z' });
  assert.strictEqual(r.post_date, '2026-06-15');
});

test('post_date falls back to transactionDate when postDate absent', () => {
  const r = mapBasiqTransaction({ id: 't1', transactionDate: '2026-05-01T10:00:00Z' });
  assert.strictEqual(r.post_date, '2026-05-01');
});

test('post_date is null (not empty string) when both dates absent', () => {
  const r = mapBasiqTransaction({ id: 't1' });
  assert.strictEqual(r.post_date, null);
});

test('description falls back to subClass.title when description absent', () => {
  const r = mapBasiqTransaction({ id: 't1', subClass: { title: 'Groceries' } });
  assert.strictEqual(r.description, 'Groceries');
});

test('description falls back to empty string when nothing present', () => {
  const r = mapBasiqTransaction({ id: 't1' });
  assert.strictEqual(r.description, '');
});

test('description is truncated to 500 characters', () => {
  const long = 'x'.repeat(600);
  const r = mapBasiqTransaction({ id: 't1', description: long });
  assert.strictEqual(r.description.length, 500);
});

test('amount coerces non-numeric to 0', () => {
  const r = mapBasiqTransaction({ id: 't1', amount: 'garbage' });
  assert.strictEqual(r.amount, 0);
});

test('amount preserves sign (debit vs credit)', () => {
  const debit = mapBasiqTransaction({ id: 't1', amount: '-42.50' });
  const credit = mapBasiqTransaction({ id: 't2', amount: '100.00' });
  assert.strictEqual(debit.amount, -42.5);
  assert.strictEqual(credit.amount, 100);
});

test('status defaults to null when absent', () => {
  const r = mapBasiqTransaction({ id: 't1' });
  assert.strictEqual(r.status, null);
});

test('status passes through when present', () => {
  const r = mapBasiqTransaction({ id: 't1', status: 'posted' });
  assert.strictEqual(r.status, 'posted');
});

test('account linkage accepts provider ids and account URLs', () => {
  assert.strictEqual(basiqAccountReference('abc'), 'basiq:abc');
  assert.strictEqual(
    basiqAccountReference('https://au-api.basiq.io/users/u1/accounts/abc'),
    'basiq:abc'
  );
  const mapped = mapBasiqTransaction({ id: 't1', account: 'abc', balance: '123.45' });
  assert.strictEqual(mapped.account_reference, 'basiq:abc');
  assert.strictEqual(mapped.balance_after, 123.45);
});

test('missing and blank provider transaction balances remain unavailable', () => {
  assert.strictEqual(mapBasiqTransaction({ id: 't1', balance: null }).balance_after, null);
  assert.strictEqual(mapBasiqTransaction({ id: 't2', balance: '' }).balance_after, null);
  assert.strictEqual(mapBasiqTransaction({ id: 't3' }).balance_after, null);
});

// ─── shapeBasiqAssetRow ───
console.log('\nshapeBasiqAssetRow');

test('savings account classifies as cash and shapes for cash_accounts', () => {
  const mapped = mapBasiqAccount({ id: 'acc-1', institution: 'HoolibankAU', class: { type: 'savings' }, balance: 5000 });
  const { bucket, table, row } = shapeBasiqAssetRow(mapped, classifyAccountType);
  assert.strictEqual(bucket, 'cash');
  assert.strictEqual(table, 'cash_accounts');
  assert.strictEqual(row.balance, 5000);
  assert.strictEqual(row.source, 'basiq');
  assert.strictEqual(row.account_reference, 'basiq:acc-1');
});

test('credit card account classifies as debt, balance is stored positive (magnitude)', () => {
  const mapped = mapBasiqAccount({ id: 'acc-2', institution: 'HoolibankAU', class: { type: 'credit-card' }, balance: -1200 });
  const { bucket, table, row } = shapeBasiqAssetRow(mapped, classifyAccountType);
  assert.strictEqual(bucket, 'debt');
  assert.strictEqual(table, 'debts');
  assert.strictEqual(row.balance, 1200, 'debts.balance is a positive magnitude, not signed');
});

test('super account classifies as super and shapes for super_accounts', () => {
  const mapped = mapBasiqAccount({ id: 'acc-3', institution: 'AustralianSuperAU', class: { type: 'superannuation' }, balance: 150000 });
  const { bucket, table, row } = shapeBasiqAssetRow(mapped, classifyAccountType);
  assert.strictEqual(bucket, 'super');
  assert.strictEqual(table, 'super_accounts');
  assert.strictEqual(row.fund_name, 'AustralianSuper');
  assert.strictEqual(row.balance, 150000);
});

test('investment/broker account classifies as invest and shapes for investments', () => {
  const mapped = mapBasiqAccount({ id: 'acc-4', institution: 'SelfWealthAU', class: { type: 'broker' }, balance: 42000 });
  const { bucket, table, row } = shapeBasiqAssetRow(mapped, classifyAccountType);
  assert.strictEqual(bucket, 'invest');
  assert.strictEqual(table, 'investments');
  assert.strictEqual(row.value, 42000);
});

test('a negative-balance unclassified account still routes to debt (classifyAccountType balance fallback)', () => {
  const mapped = mapBasiqAccount({ id: 'acc-5', institution: 'HoolibankAU', balance: -50 });
  const { bucket } = shapeBasiqAssetRow(mapped, classifyAccountType);
  assert.strictEqual(bucket, 'debt');
});

console.log('\nraw import quality boundary');

test('raw projections preserve invalid provider values for validation', () => {
  const account = rawAccountProjection({ id: 'a1', balance: 'garbage' }, '2026-07-30T00:00:00Z');
  const transaction = rawTransactionProjection({ id: 't1', amount: null, postDate: '2026-02-30' });
  assert.strictEqual(account.balance, 'garbage');
  assert.strictEqual(transaction.amount, null);
  assert.strictEqual(transaction.post_date, '2026-02-30');
});

test('only error-level entities are quarantined', () => {
  const invalid = invalidEntityKeys([
    { entity_type: 'transaction', entity_key: 'bad', severity: 'error' },
    { entity_type: 'transaction', entity_key: 'future', severity: 'warning' },
    { entity_type: 'account', entity_key: 'other', severity: 'error' },
  ], 'transaction');
  assert.deepStrictEqual([...invalid], ['bad']);
});

test('missing provider IDs receive distinct deterministic evidence keys', () => {
  const row = { balance: 'bad' };
  assert.strictEqual(providerRecordKey(row, 'account', 0), providerRecordKey(row, 'account', 0));
  assert.notStrictEqual(providerRecordKey(row, 'account', 0), providerRecordKey(row, 'account', 1));
});

(async () => {
  await testAsync('shared importer preserves raw rows, quarantines invalid data, and runs quality once', async () => {
    const rawSaved = [];
    const normalisedAccounts = [];
    let quarantinedReferences;
    let normalisedTransactions;
    let qualityOptions;
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => [
          { id: 'a-good', name: 'Everyday', class: { type: 'transaction' }, balance: '100' },
          { id: 'a-bad', name: 'Broken', class: { type: 'transaction' }, balance: 'not-money' },
        ],
        getTransactions: async () => [
          { id: 't-good', amount: '-10', postDate: '2026-07-01', description: 'Coffee' },
          { id: 't-bad', amount: null, postDate: '2026-07-02', description: 'Broken' },
        ],
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async (_userId, rows, quarantined) => {
        normalisedAccounts.push(...rows);
        quarantinedReferences = quarantined;
      },
      transactions: {
        upsertBasiqTransactions: async (_userId, rows) => {
          normalisedTransactions = rows;
          return rows.length;
        },
      },
      integrity: {
        appendRawRecord: async (_userId, row) => rawSaved.push(row),
      },
      quality: {
        runDataQualityChecks: async (_userId, options) => {
          qualityOptions = options;
          return { status: 'critical' };
        },
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: { reconcileAccounts: async () => [] },
    });

    const result = await service.sync(77);
    assert.strictEqual(rawSaved.length, 4, 'all raw evidence is retained, including quarantined rows');
    assert.strictEqual(normalisedAccounts.length, 1);
    assert.deepStrictEqual(quarantinedReferences, ['basiq:a-bad']);
    assert.deepStrictEqual(normalisedTransactions.map((row) => row.id), ['t-good']);
    assert.strictEqual(result.accounts, 1);
    assert.strictEqual(result.transactions, 1);
    assert.deepStrictEqual(result.coverage, {
      accounts: 'complete', transactions: 'complete', reconciliation: 'incomplete',
    });
    assert.deepStrictEqual(
      qualityOptions.additionalFindings.map((item) => item.check_code).sort(),
      ['source.basiq.account.invalid_balance', 'source.basiq.transaction.invalid_amount']
    );
  });

  await testAsync('transaction persistence failure is reported as precise incomplete coverage', async () => {
    let qualityOptions;
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => [],
        getTransactions: async () => [
          { id: 't1', amount: 10, postDate: '2026-07-01' },
        ],
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => null,
      transactions: {
        upsertBasiqTransactions: async () => { throw new Error('write failed'); },
      },
      integrity: { appendRawRecord: async () => null },
      quality: {
        runDataQualityChecks: async (_userId, options) => {
          qualityOptions = options;
          return { status: 'incomplete' };
        },
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: { reconcileAccounts: async () => [] },
    });
    await assert.rejects(() => service.sync(78), /Transaction persistence failed/);
    assert.deepStrictEqual(qualityOptions.coverage, {
      accounts: 'complete', transactions: 'failed', reconciliation: 'not_run',
    });
    assert.match(qualityOptions.message, /Transaction persistence failed/);
  });

  await testAsync('reconciliation failure is reported without downgrading transaction persistence', async () => {
    let qualityOptions;
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => [],
        getTransactions: async () => [],
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => null,
      transactions: { upsertBasiqTransactions: async () => 0 },
      integrity: { appendRawRecord: async () => null },
      quality: {
        runDataQualityChecks: async (_userId, options) => {
          qualityOptions = options;
          return { status: 'incomplete' };
        },
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: {
        reconcileAccounts: async () => { throw new Error('reconciliation unavailable'); },
      },
    });
    await assert.rejects(() => service.sync(79), /Account reconciliation failed/);
    assert.deepStrictEqual(qualityOptions.coverage, {
      accounts: 'complete', transactions: 'complete', reconciliation: 'failed',
    });
    assert.match(qualityOptions.message, /Account reconciliation failed/);
  });

  await testAsync('transactions without account linkage make reconciliation evidence incomplete', async () => {
    let reconciliationOptions;
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => [],
        getTransactions: async () => [
          { id: 'unlinked', amount: 10, postDate: '2026-07-01' },
        ],
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => null,
      transactions: { upsertBasiqTransactions: async () => 1 },
      integrity: { appendRawRecord: async () => null },
      quality: {
        runDataQualityChecks: async () => ({ status: 'incomplete' }),
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: {
        reconcileAccounts: async (_userId, options) => { reconciliationOptions = options; },
      },
    });
    const result = await service.sync(80);
    assert.equal(reconciliationOptions.evidenceComplete, false);
    assert.equal(result.coverage.reconciliation, 'incomplete');
  });

  await testAsync('retry resumes after the last durable stage checkpoint', async () => {
    let accountFetches = 0;
    let transactionFetches = 0;
    const checkpoints = {};
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => {
          accountFetches++;
          return [{ id: 'a1', balance: 100, class: { type: 'transaction' } }];
        },
        getTransactions: async () => { transactionFetches++; return []; },
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => null,
      transactions: { upsertBasiqTransactions: async () => 0 },
      integrity: { appendRawRecord: async () => null },
      quality: {
        runDataQualityChecks: async () => ({ status: 'healthy' }),
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: { reconcileAccounts: async () => [] },
    });
    await assert.rejects(
      () => service.sync(81, {
        onProgress: async (stage, _details, checkpoint) => {
          checkpoints[stage] = checkpoint;
          if (stage === 'accounts') throw new Error('worker crashed');
        },
      }),
      /worker crashed/
    );
    await service.sync(81, { checkpoints, onProgress: async () => null });
    assert.equal(accountFetches, 1, 'completed account stage must not rerun');
    assert.equal(transactionFetches, 1);
  });

  await testAsync('failed transaction and reconciliation stages are retried, not checkpointed', async () => {
    const checkpoints = {};
    let accountFetches = 0;
    let transactionFetches = 0;
    let reconciliationAttempts = 0;
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => { accountFetches++; return []; },
        getTransactions: async () => {
          transactionFetches++;
          if (transactionFetches === 1) throw new Error('temporary transaction outage');
          return [];
        },
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => null,
      transactions: { upsertBasiqTransactions: async () => 0 },
      integrity: { appendRawRecord: async () => null },
      quality: {
        runDataQualityChecks: async () => ({ status: 'healthy' }),
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: {
        reconcileAccounts: async () => {
          reconciliationAttempts++;
          if (reconciliationAttempts === 1) throw new Error('temporary reconciliation outage');
        },
      },
    });
    const progress = async (stage, _details, checkpoint) => {
      if (checkpoint !== null) checkpoints[stage] = checkpoint;
    };
    await assert.rejects(
      () => service.sync(82, { checkpoints, onProgress: progress }),
      /Transaction import failed/
    );
    assert.equal(checkpoints.transactions, undefined);
    await assert.rejects(
      () => service.sync(82, { checkpoints, onProgress: progress }),
      /Account reconciliation failed/
    );
    assert.equal(checkpoints.reconciliation, undefined);
    await service.sync(82, { checkpoints, onProgress: progress });
    assert.equal(accountFetches, 1);
    assert.equal(transactionFetches, 2);
    assert.equal(reconciliationAttempts, 2);
  });

  await testAsync('wrapped transaction failures preserve provider consent metadata', async () => {
    const providerError = Object.assign(new Error('consent expired'), {
      provider: 'basiq',
      status: 403,
      path: '/users/u1/transactions',
      providerCode: 'consent-expired',
    });
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => [],
        getTransactions: async () => { throw providerError; },
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => null,
      transactions: { upsertBasiqTransactions: async () => 0 },
      integrity: { appendRawRecord: async () => null },
      quality: {
        runDataQualityChecks: async () => ({ status: 'incomplete' }),
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: { reconcileAccounts: async () => [] },
    });
    await assert.rejects(
      () => service.sync(84),
      (error) => error.provider === 'basiq'
        && error.status === 403
        && error.providerCode === 'consent-expired'
    );
  });

  await testAsync('lost job ownership prevents stale financial writes', async () => {
    let accountWrites = 0;
    let ownershipChecks = 0;
    const service = createBasiqSyncService({
      provider: {
        getAccounts: async () => [{ id: 'a1', balance: 100 }],
        getTransactions: async () => [],
      },
      findUser: async () => ({ basiq_user_id: 'provider-user' }),
      replaceAccounts: async () => { accountWrites++; },
      transactions: { upsertBasiqTransactions: async () => 0 },
      integrity: { appendRawRecord: async () => { accountWrites++; } },
      quality: {
        runDataQualityChecks: async () => ({ status: 'healthy' }),
        recordDataQualityFailure: async () => null,
      },
      classify: () => 'cash',
      reconciliation: { reconcileAccounts: async () => [] },
    });
    await assert.rejects(
      () => service.sync(83, {
        assertOwnership: async () => {
          ownershipChecks++;
          throw new Error('lease lost during provider request');
        },
      }),
      /lease lost/
    );
    assert.equal(ownershipChecks, 1);
    assert.equal(accountWrites, 0);
  });

  // ─── basiqFetch error handling (mocked fetch, no network) ───
  console.log('\nbasiqFetch error handling');

  async function withMockedFetch(mockImpl, fn) {
    const original = global.fetch;
    global.fetch = mockImpl;
    try {
      // services/basiq.js reads BASIQ_API_KEY at call time via apiKey(); a
      // dummy key is enough since fetch itself is mocked and never hits the network.
      process.env.BASIQ_API_KEY = 'test-key-not-real';
      delete require.cache[require.resolve('../services/basiq')];
      const basiq = require('../services/basiq');
      await fn(basiq);
    } finally {
      global.fetch = original;
      delete process.env.BASIQ_API_KEY;
      delete require.cache[require.resolve('../services/basiq')];
    }
  }

  await testAsync('throws with status + path + Basiq-shaped detail on non-2xx', async () => {
    await withMockedFetch(
      async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ data: [{ detail: 'Invalid API key' }] }),
      }),
      async (basiq) => {
        await assert.rejects(
          () => basiq.getAccounts('user-1'),
          (err) => {
            assert.match(err.message, /Basiq 401 on/);
            assert.match(err.message, /Invalid API key/);
            return true;
          }
        );
      }
    );
  });

  await testAsync('falls back to raw text (first 200 chars) when body is not Basiq-shaped JSON', async () => {
    await withMockedFetch(
      async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error - upstream timeout',
      }),
      async (basiq) => {
        await assert.rejects(
          () => basiq.getAccounts('user-1'),
          (err) => {
            assert.match(err.message, /Basiq 500 on/);
            assert.match(err.message, /Internal Server Error/);
            return true;
          }
        );
      }
    );
  });

  await testAsync('does not throw a secondary error when the error body is not valid JSON', async () => {
    await withMockedFetch(
      async () => ({
        ok: false,
        status: 503,
        text: async () => '<html>not json</html>',
      }),
      async (basiq) => {
        // Must reject with the Basiq error, not a JSON.parse SyntaxError.
        await assert.rejects(
          () => basiq.getAccounts('user-1'),
          (err) => {
            assert.match(err.message, /Basiq 503/);
            assert.ok(!(err instanceof SyntaxError));
            return true;
          }
        );
      }
    );
  });

  await testAsync('does not throw at all on a 2xx response', async () => {
    await withMockedFetch(
      async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: 'acc-1', balance: 500 }] }),
      }),
      async (basiq) => {
        const accounts = await basiq.getAccounts('user-1');
        assert.strictEqual(accounts.length, 1);
        assert.strictEqual(accounts[0].id, 'acc-1');
      }
    );
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
