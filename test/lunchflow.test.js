'use strict';

const assert = require('assert');
const crypto = require('crypto');

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

function loadLunchFlow(env = {}) {
  for (const name of ['LUNCHFLOW_CLIENT_ID', 'LUNCHFLOW_CLIENT_SECRET', 'LUNCHFLOW_BASE_URL']) {
    delete process.env[name];
  }
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../services/lunchflow')];
  return require('../services/lunchflow');
}

function mockResponse() {
  return {
    location: null,
    redirect(value) { this.location = value; return this; },
  };
}

(async () => {
  console.log('\nLunch Flow configuration and OAuth');

  await test('is configured only when both client credentials exist', () => {
    assert.strictEqual(loadLunchFlow().isConfigured(), false);
    assert.strictEqual(loadLunchFlow({ LUNCHFLOW_CLIENT_ID: 'client-only' }).isConfigured(), false);
    assert.strictEqual(loadLunchFlow({
      LUNCHFLOW_CLIENT_ID: 'client-id',
      LUNCHFLOW_CLIENT_SECRET: 'client-secret',
    }).isConfigured(), true);
  });

  await test('builds an authorization URL with exact callback, email, and state', () => {
    const lunchflow = loadLunchFlow({
      LUNCHFLOW_CLIENT_ID: 'client id',
      LUNCHFLOW_CLIENT_SECRET: 'secret',
    });
    const url = new URL(lunchflow.getAuthorizationUrl({
      redirectUri: 'https://www.hellomaal.com/lunchflow/callback',
      email: 'person+test@example.com',
      state: 'random-state',
    }));
    assert.strictEqual(url.origin + url.pathname, 'https://lunchflow.app/api/platform/oauth/authorize');
    assert.strictEqual(url.searchParams.get('client_id'), 'client id');
    assert.strictEqual(url.searchParams.get('redirect_uri'), 'https://www.hellomaal.com/lunchflow/callback');
    assert.strictEqual(url.searchParams.get('email'), 'person+test@example.com');
    assert.strictEqual(url.searchParams.get('state'), 'random-state');
  });

  await test('exchanges an authorization code without exposing credentials in the URL', async () => {
    let captured;
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
      };
    };
    try {
      const lunchflow = loadLunchFlow({
        LUNCHFLOW_CLIENT_ID: 'client-id',
        LUNCHFLOW_CLIENT_SECRET: 'client-secret',
      });
      const tokens = await lunchflow.exchangeAuthorizationCode({
        code: 'authorization-code',
        redirectUri: 'https://www.hellomaal.com/lunchflow/callback',
      });
      assert.strictEqual(captured.url, 'https://lunchflow.app/api/platform/oauth/token');
      assert.strictEqual(captured.options.method, 'POST');
      assert.deepStrictEqual(JSON.parse(captured.options.body), {
        grant_type: 'authorization_code',
        code: 'authorization-code',
        redirect_uri: 'https://www.hellomaal.com/lunchflow/callback',
        client_id: 'client-id',
        client_secret: 'client-secret',
      });
      assert.strictEqual(tokens.access_token, 'access-token');
      assert.ok(!captured.url.includes('client-secret'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  console.log('\nLunch Flow token protection');

  await test('encrypts provider tokens at rest and can decrypt them', () => {
    process.env.SESSION_SECRET = 'test-session-secret-with-enough-entropy';
    delete require.cache[require.resolve('../services/provider-token-crypto')];
    const tokenCrypto = require('../services/provider-token-crypto');
    const encrypted = tokenCrypto.encryptToken('lf-access-sensitive');
    assert.notStrictEqual(encrypted, 'lf-access-sensitive');
    assert.ok(!encrypted.includes('lf-access-sensitive'));
    assert.strictEqual(tokenCrypto.decryptToken(encrypted), 'lf-access-sensitive');
    delete process.env.SESSION_SECRET;
  });

  await test('rejects an encrypted token that has been modified', () => {
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    delete require.cache[require.resolve('../services/provider-token-crypto')];
    const tokenCrypto = require('../services/provider-token-crypto');
    const encrypted = tokenCrypto.encryptToken('refresh-token');
    const parts = encrypted.split('.');
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
    const tampered = parts.join('.');
    assert.throws(() => tokenCrypto.decryptToken(tampered));
    delete process.env.SESSION_SECRET;
  });

  console.log('\nLunch Flow HTTP routes');

  await test('authenticated connect stores state and redirects to Lunch Flow', async () => {
    let authorizeInput;
    const session = { userId: 42 };
    const { createHandlers } = require('../routes/lunchflow');
    const handlers = createHandlers({
      provider: {
        isConfigured: () => true,
        getAuthorizationUrl: (input) => {
          authorizeInput = input;
          return `https://lunchflow.app/authorize?state=${encodeURIComponent(input.state)}`;
        },
      },
      userStore: { findUserById: async () => ({ id: 42, email: 'user@example.com' }) },
      connectionStore: {},
      tokenProtection: { isConfigured: () => true },
    });
    const response = mockResponse();
    await handlers.connect({ session }, response);
      assert.match(response.location, /^https:\/\/lunchflow\.app\/authorize/);
      assert.strictEqual(authorizeInput.email, 'user@example.com');
      assert.strictEqual(authorizeInput.state, session.lunchflowOAuthState);
      assert.strictEqual(authorizeInput.state.length, 43);
  });

  await test('callback rejects a mismatched OAuth state without exchanging the code', async () => {
    let exchangeCalled = false;
    const session = { userId: 42, lunchflowOAuthState: 'expected-state' };
    const { createHandlers } = require('../routes/lunchflow');
    const handlers = createHandlers({
      provider: {
        isConfigured: () => true,
        exchangeAuthorizationCode: async () => { exchangeCalled = true; },
      },
      userStore: {},
      connectionStore: {},
    });
    const response = mockResponse();
    await handlers.callback({ session, query: { code: 'code', state: 'wrong-state' } }, response);
      assert.strictEqual(response.location, '/app/assets?lunchflow=invalid_state');
      assert.strictEqual(exchangeCalled, false);
      assert.strictEqual(session.lunchflowOAuthState, undefined);
  });

  await test('valid callback exchanges the code and stores tokens for the signed-in user', async () => {
    let saved;
    const session = { userId: 42, lunchflowOAuthState: 'expected-state' };
    const { createHandlers } = require('../routes/lunchflow');
    const handlers = createHandlers({
      provider: {
        isConfigured: () => true,
        exchangeAuthorizationCode: async ({ code }) => ({
          access_token: `access-for-${code}`,
          refresh_token: 'refresh-token',
        }),
      },
      userStore: {},
      connectionStore: {
        upsertConnection: async (...args) => { saved = args; },
      },
    });
    const response = mockResponse();
    await handlers.callback({ session, query: { code: 'valid-code', state: 'expected-state' } }, response);
      assert.strictEqual(response.location, '/app/assets?lunchflow=connected');
      assert.strictEqual(saved[0], 42);
      assert.strictEqual(saved[1], 'lunchflow');
      assert.strictEqual(saved[2].access_token, 'access-for-valid-code');
  });

  await test('status reports Lunch Flow independently from Basiq', async () => {
    const { createHandlers } = require('../routes/lunchflow');
    const handlers = createHandlers({
      provider: { isConfigured: () => true, manifest: { scopes: ['accounts:read'] } },
      connectionStore: { getConnectionMetadata: async () => ({ provider: 'lunchflow', scopes: 'accounts:read balances:read' }) },
      healthStore: { getHealth: async () => ({ provider: 'lunchflow', status: 'healthy' }) },
      tokenProtection: { isConfigured: () => true },
      userStore: {},
    });
    let body;
    const response = { json(value) { body = value; return this; }, status() { return this; } };
    await handlers.status({ session: { userId: 42 } }, response);
    assert.deepStrictEqual(body, {
      live: true, connected: true,
      scopes: ['accounts:read', 'balances:read'],
      scopes_confirmed: true,
      health: { provider: 'lunchflow', status: 'healthy' },
    });
  });

  await test('sync endpoint queues a durable idempotent import run', async () => {
    const { createHandlers } = require('../routes/lunchflow');
    let enqueued;
    const handlers = createHandlers({
      provider: { isConfigured: () => true },
      connectionStore: {},
      userStore: {},
      importRuns: { enqueueImportRun: async (userId, options) => {
        enqueued = { userId, options };
        return { run: { id: 7, status: 'queued' }, job: { id: 8 } };
      } },
    });
    let body;
    let statusCode;
    const response = { json(value) { body = value; return this; }, status(value) { statusCode = value; return this; } };
    await handlers.sync({ session: { userId: 42 }, get: () => 'sync-request-1' }, response);
    assert.equal(statusCode, 202);
    assert.deepStrictEqual(body, { ok: true, import_run_id: 7, job_id: 8, status: 'queued' });
    assert.deepStrictEqual(enqueued, { userId: 42, options: { provider: 'lunchflow', requestKey: 'sync-request-1', jobType: 'lunchflow_import' } });
  });

  await test('disconnect deletes stored tokens and records revocation health', async () => {
    const { createHandlers } = require('../routes/lunchflow');
    const events = [];
    const handlers = createHandlers({
      provider: { isConfigured: () => true },
      connectionStore: {
        getConnection: async () => ({ access_token: 'token', scopes: 'accounts:read' }),
        deleteConnection: async () => events.push('deleted'),
        recordEvent: async (_u, _p, type) => events.push(type),
      },
      healthStore: { upsertHealth: async (_u, _p, patch) => events.push(patch.status) },
    });
    let body;
    await handlers.disconnect({ session: { userId: 42 } }, { json(value) { body = value; return this; }, status() { return this; } });
    assert.deepStrictEqual(body, { ok: true, connected: false, remote_revoke_failed: false });
    assert.deepStrictEqual(events, ['deleted', 'revoked', 'reauthorization_required']);
  });

  await test('disconnect deletes local tokens even when remote revocation fails', async () => {
    const { createHandlers } = require('../routes/lunchflow');
    let deleted = false;
    const handlers = createHandlers({
      provider: { revokeAccess: async () => { throw new Error('provider unavailable'); } },
      connectionStore: {
        getConnection: async () => ({ access_token: 'token' }),
        deleteConnection: async () => { deleted = true; },
        recordEvent: async () => null,
      },
      healthStore: { upsertHealth: async () => null },
    });
    let body;
    await handlers.disconnect({ session: { userId: 42 } }, { json(value) { body = value; return this; }, status() { return this; } });
    assert.equal(deleted, true);
    assert.equal(body.remote_revoke_failed, true);
  });

  console.log('\nLunch Flow financial data API');

  await test('lists accounts with the user bearer token', async () => {
    let captured;
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ accounts: [{ id: 'account-1' }] }),
      };
    };
    try {
      const lunchflow = loadLunchFlow({
        LUNCHFLOW_CLIENT_ID: 'client-id',
        LUNCHFLOW_CLIENT_SECRET: 'client-secret',
      });
      const accounts = await lunchflow.getAccounts('user-access-token');
      assert.strictEqual(captured.url, 'https://lunchflow.app/api/platform/v1/accounts');
      assert.strictEqual(captured.options.headers.Authorization, 'Bearer user-access-token');
      assert.deepStrictEqual(accounts, [{ id: 'account-1' }]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('lists transactions for one encoded account id', async () => {
    let capturedUrl;
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ transactions: [{ id: 'transaction-1' }] }),
      };
    };
    try {
      const lunchflow = loadLunchFlow({
        LUNCHFLOW_CLIENT_ID: 'client-id',
        LUNCHFLOW_CLIENT_SECRET: 'client-secret',
      });
      const transactions = await lunchflow.getTransactions('account/with slash', 'token');
      assert.strictEqual(
        capturedUrl,
        'https://lunchflow.app/api/platform/v1/accounts/account%2Fwith%20slash/transactions?include_pending=true'
      );
      assert.deepStrictEqual(transactions, [{ id: 'transaction-1' }]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('refreshes an expired user token with the client secret in the request body', async () => {
    let body;
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh' }),
      };
    };
    try {
      const lunchflow = loadLunchFlow({
        LUNCHFLOW_CLIENT_ID: 'client-id',
        LUNCHFLOW_CLIENT_SECRET: 'client-secret',
      });
      const tokens = await lunchflow.refreshTokens('old-refresh');
      assert.deepStrictEqual(body, {
        grant_type: 'refresh_token',
        refresh_token: 'old-refresh',
        client_id: 'client-id',
        client_secret: 'client-secret',
      });
      assert.strictEqual(tokens.access_token, 'new-access');
    } finally {
      global.fetch = originalFetch;
    }
  });

  console.log('\nLunch Flow normalization');

  await test('maps a Lunch Flow account and balance to a provider-scoped cash account', () => {
    const { mapAccount } = require('../lib/lunchflow-mapping');
    assert.deepStrictEqual(mapAccount({
      id: 123,
      name: 'Everyday Account',
      institution_name: 'Example Bank',
      type: 'transaction',
      currency: 'AUD',
      status: 'ACTIVE',
      updated_at: '2026-08-07T00:00:00Z',
    }, { amount: 1234.56, currency: 'AUD' }), {
      account_reference: 'lunchflow:123',
      institution_name: 'Example Bank',
      institution_type: 'bank',
      account_type: 'cash',
      label: 'Everyday Account',
      balance: 1234.56,
      currency: 'AUD',
      status: 'active',
      observed_at: '2026-08-07T00:00:00Z',
    });
  });

  await test('maps Lunch Flow transaction fields and scopes its provider id', () => {
    const { mapTransaction } = require('../lib/lunchflow-mapping');
    assert.deepStrictEqual(mapTransaction({
      id: 'txn-1',
      accountId: 123,
      amount: -19.95,
      date: '2026-08-07',
      merchant: 'Corner Shop',
      description: 'Card purchase',
      isPending: false,
    }), {
      provider_id: 'lunchflow:txn-1',
      account_reference: 'lunchflow:123',
      amount: -19.95,
      post_date: '2026-08-07',
      description: 'Corner Shop — Card purchase',
      status: 'posted',
    });
  });

  console.log('\nLunch Flow synchronization');

  await test('syncs balances and transactions for every Lunch Flow account', async () => {
    const { createSyncService } = require('../services/lunchflow-sync');
    let savedAccounts;
    let savedTransactions;
    const sync = createSyncService({
      provider: {
        getAccounts: async () => [
          { id: 1, name: 'Daily', institution_name: 'Bank A', currency: 'AUD' },
          { id: 2, name: 'Saver', institution_name: 'Bank B', currency: 'AUD' },
        ],
        getBalance: async (id) => ({ amount: id === 1 ? 100 : 200, currency: 'AUD' }),
        getTransactions: async (id) => [{
          id: `txn-${id}`, accountId: id, amount: -id, date: '2026-08-07', description: 'Test',
        }],
      },
      connectionStore: {
        getConnection: async () => ({ access_token: 'access', refresh_token: 'refresh' }),
      },
      accountStore: {
        replaceAccounts: async (_userId, accounts) => { savedAccounts = accounts; },
      },
      transactionStore: {
        upsertTransactions: async (_userId, transactions) => { savedTransactions = transactions; },
      },
    });
    const result = await sync(42);
    assert.deepStrictEqual(savedAccounts.map((row) => row.balance), [100, 200]);
    assert.deepStrictEqual(savedTransactions.map((row) => row.provider_id), [
      'lunchflow:txn-1', 'lunchflow:txn-2',
    ]);
    assert.deepStrictEqual(result, { accounts: 2, transactions: 2, holdings: 0 });
  });

  await test('refreshes once and retries provider data after an unexpected 401', async () => {
    const { createSyncService } = require('../services/lunchflow-sync');
    let accountCalls = 0;
    let savedTokens;
    const sync = createSyncService({
      provider: {
        getAccounts: async (token) => {
          accountCalls++;
          if (token === 'expired') { const error = new Error('expired'); error.status = 401; throw error; }
          return [];
        },
        refreshTokens: async () => ({ access_token: 'fresh', refresh_token: 'rotated' }),
      },
      connectionStore: {
        getConnection: async () => ({ access_token: 'expired', refresh_token: 'refresh' }),
        upsertConnection: async (_userId, _provider, tokens) => { savedTokens = tokens; },
      },
      accountStore: { replaceAccounts: async () => {} },
      transactionStore: { upsertTransactions: async () => {} },
    });
    await sync(42);
    assert.strictEqual(accountCalls, 2);
    assert.strictEqual(savedTokens.access_token, 'fresh');
  });

  for (const name of ['LUNCHFLOW_CLIENT_ID', 'LUNCHFLOW_CLIENT_SECRET', 'LUNCHFLOW_BASE_URL']) {
    delete process.env[name];
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
