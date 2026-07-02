'use strict';

// test/basiq-sync.test.js
// Deterministic tests for the Basiq sync mapping contract (specs/basiq-sync.md)
// and the basiqFetch error-handling contract. No network, no DB — everything
// here mocks global.fetch or calls pure functions directly.

const assert = require('assert');
const { mapBasiqAccount, mapBasiqTransaction } = require('../lib/basiq-mapping');

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

test('balance is rounded to an integer', () => {
  const r = mapBasiqAccount({ id: '1', balance: 1234.789 });
  assert.strictEqual(r.balance, 1235);
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

(async () => {
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
