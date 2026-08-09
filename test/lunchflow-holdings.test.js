'use strict';

const assert = require('assert');
const { mapHolding } = require('../lib/lunchflow-mapping');
const { createSyncService, transactionWindowStart } = require('../services/lunchflow-sync');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

(async () => {
  console.log('\nLunch Flow holdings and mirror policy');

  await test('maps a provider holding with stable identity and valuation provenance', () => {
    assert.deepStrictEqual(mapHolding({
      security: {
        name: 'Vanguard Australian Shares Index ETF',
        tickerSymbol: 'VAS',
        isin: 'AU000000VAS1',
        currency: 'AUD',
      },
      quantity: 12.345678,
      price: 101.25,
      value: 1249.9998975,
      costBasis: 1100,
      currency: 'AUD',
    }, 'broker-1', '2026-08-07T04:00:00.000Z'), {
      account_reference: 'lunchflow:broker-1',
      holding_key: 'isin:AU000000VAS1',
      name: 'Vanguard Australian Shares Index ETF',
      ticker: 'VAS',
      isin: 'AU000000VAS1',
      figi: null,
      exchange: null,
      currency: 'AUD',
      units: '12.345678',
      price_minor: 10125,
      value_minor: 125000,
      cost_basis_minor: 110000,
      observed_at: '2026-08-07T04:00:00.000Z',
    });
  });

  await test('uses a deterministic 120-day transaction mirror window', () => {
    assert.strictEqual(
      transactionWindowStart(new Date('2026-08-07T12:00:00Z')),
      '2026-04-09'
    );
  });

  await test('reads platform holdings and treats HTTP 501 as unsupported', async () => {
    const originalFetch = global.fetch;
    process.env.LUNCHFLOW_CLIENT_ID = 'client-id';
    process.env.LUNCHFLOW_CLIENT_SECRET = 'client-secret';
    delete require.cache[require.resolve('../services/lunchflow')];
    const lunchflow = require('../services/lunchflow');
    const requested = [];
    global.fetch = async (url) => {
      requested.push(url);
      if (requested.length === 1) return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ holdings: [{ quantity: 1 }] }),
      };
      return {
        ok: false, status: 501,
        text: async () => JSON.stringify({ error: 'Not supported' }),
      };
    };
    try {
      assert.deepStrictEqual(await lunchflow.getHoldings('broker/1', 'token'), {
        holdings: [{ quantity: 1 }], supported: true,
      });
      assert.deepStrictEqual(await lunchflow.getHoldings('cash-1', 'token'), {
        holdings: [], supported: false,
      });
      assert.strictEqual(
        requested[0],
        'https://lunchflow.app/api/platform/v1/accounts/broker%2F1/holdings'
      );
    } finally {
      global.fetch = originalFetch;
      delete process.env.LUNCHFLOW_CLIENT_ID;
      delete process.env.LUNCHFLOW_CLIENT_SECRET;
      delete require.cache[require.resolve('../services/lunchflow')];
    }
  });

  await test('sync persists holdings and passes the complete mirror window to transactions', async () => {
    let holdingArgs;
    let transactionArgs;
    const sync = createSyncService({
      now: () => new Date('2026-08-07T04:00:00Z'),
      provider: {
        getAccounts: async () => [{
          id: 'broker-1', name: 'Broker', type: 'brokerage',
          institution_name: 'Broker Co', currency: 'AUD', status: 'ACTIVE',
        }],
        getBalance: async () => ({ amount: 1250, currency: 'AUD' }),
        getTransactions: async (_id, _token, options) => {
          assert.strictEqual(options.from, '2026-04-09');
          return [{ id: 'txn-1', accountId: 'broker-1', amount: -10, date: '2026-08-01' }];
        },
        getHoldings: async () => [{
          security: { name: 'VAS', tickerSymbol: 'VAS', isin: 'AU000000VAS1' },
          quantity: 2, value: 200, currency: 'AUD',
        }],
      },
      connectionStore: {
        getConnection: async () => ({ access_token: 'access', refresh_token: 'refresh' }),
      },
      accountStore: {
        replaceAccounts: async () => {},
        promoteCanonicalAccounts: async () => ({ promoted: 1 }),
      },
      transactionStore: {
        upsertTransactions: async (...args) => { transactionArgs = args; },
      },
      holdingStore: {
        replaceHoldings: async (...args) => { holdingArgs = args; return { holdings: 1 }; },
      },
    });

    const result = await sync(42);
    assert.strictEqual(holdingArgs[0], 42);
    assert.strictEqual(holdingArgs[1][0].holding_key, 'isin:AU000000VAS1');
    assert.deepStrictEqual(holdingArgs[2].accountReferences, ['lunchflow:broker-1']);
    assert.strictEqual(transactionArgs[2].windowStart, '2026-04-09');
    assert.deepStrictEqual(transactionArgs[2].accountReferences, ['lunchflow:broker-1']);
    assert.strictEqual(result.holdings, 1);
  });

  await test('sync marks unsupported holding snapshots so prior decomposition is preserved', async () => {
    let canonicalOptions;
    const sync = createSyncService({
      now: () => new Date('2026-08-09T04:00:00Z'),
      provider: {
        getAccounts: async () => [{ id: 'broker-1', name: 'Broker', type: 'brokerage', currency: 'AUD' }],
        getBalance: async () => ({ amount: 1250, currency: 'AUD' }),
        getTransactions: async () => [],
        getHoldings: async () => ({ holdings: [], supported: false }),
      },
      connectionStore: { getConnection: async () => ({ access_token: 'access' }) },
      accountStore: {
        replaceAccounts: async () => {},
        promoteCanonicalAccounts: async (_userId, _accounts, options) => {
          canonicalOptions = options;
          return { promoted: 1 };
        },
      },
      transactionStore: { upsertTransactions: async () => {} },
      holdingStore: { replaceHoldings: async () => ({ holdings: 0 }) },
    });

    await sync(42);
    assert.deepStrictEqual(canonicalOptions.holdingsByAccount, {});
    assert.deepStrictEqual(canonicalOptions.unsupportedHoldingAccounts, ['lunchflow:broker-1']);
    assert.strictEqual(canonicalOptions.observedAt, '2026-08-09T04:00:00.000Z');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
