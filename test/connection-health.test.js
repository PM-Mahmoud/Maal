const assert = require('assert');
const {
  errorStatus,
  summarizeConnections,
  createConnectionHealthHandler,
  shouldRecordProviderFailure,
  seedConnectionHealthJobs,
} = require('../services/connection-health');

(async () => {
  assert.equal(errorStatus(Object.assign(new Error('Forbidden'), {
    status: 403, path: '/users/u1/connections',
  })),
    'reauthorization_required');
  assert.equal(errorStatus(Object.assign(new Error('Invalid API key'), { status: 401 })),
    'degraded');
  assert.equal(shouldRecordProviderFailure(new Error('database unavailable')), false);
  assert.equal(shouldRecordProviderFailure(Object.assign(new Error('fetch failed'), {
    provider: 'basiq',
  })), true);
  assert.equal(errorStatus(new Error('Consent has expired')), 'reauthorization_required');
  assert.equal(errorStatus(new Error('Provider timeout')), 'degraded');

  const now = new Date('2026-07-30T00:00:00Z');
  assert.equal(summarizeConnections([{ status: 'active' }], now).status, 'healthy');
  assert.equal(summarizeConnections([{
    status: 'active', consentExpiresAt: '2026-08-03T00:00:00Z',
  }], now).status, 'expiring');
  assert.equal(summarizeConnections([{
    status: 'active', consentExpiresAt: '2026-07-29T00:00:00Z',
  }], now).status, 'reauthorization_required');
  assert.equal(summarizeConnections([{ status: 'invalid' }], now).status,
    'reauthorization_required');
  assert.equal(summarizeConnections([
    { id: 'old', status: 'deleted', consentExpiresAt: '2026-07-01T00:00:00Z' },
    { id: 'current', status: 'active', consentExpiresAt: '2027-07-01T00:00:00Z' },
  ], now).status, 'healthy');

  const scheduled = [];
  await seedConnectionHealthJobs(
    { listLinkedBasiqUserIds: async () => [4, 7] },
    async (userId) => scheduled.push(userId)
  );
  assert.deepStrictEqual(scheduled, [4, 7]);

  const handler = createConnectionHealthHandler({
    getHealth: async (userId) => ({
      provider: 'basiq', status: userId === 7 ? 'expiring' : 'healthy',
    }),
  });
  const response = () => {
    const state = { code: 200, body: null };
    return {
      state,
      status(code) { state.code = code; return this; },
      json(body) { state.body = body; return this; },
    };
  };
  const unauthenticated = response();
  await handler({ session: {} }, unauthenticated);
  assert.equal(unauthenticated.state.code, 401);
  const expiring = response();
  await handler({ session: { userId: 7 } }, expiring);
  assert.equal(expiring.state.body.reauthorise_url, '/basiq/reauthorise');

  console.log('✓ connection health classifies provider and consent states');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
