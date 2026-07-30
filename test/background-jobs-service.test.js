const assert = require('assert');
const { createListJobsHandler } = require('../services/background-jobs');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  let requested;
  const handler = createListJobsHandler({
    listJobsForUser: async (userId, limit) => {
      requested = { userId, limit };
      return [{ id: 1, status: 'queued' }];
    },
  });
  const unauthenticated = response();
  await handler({ session: {}, query: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const authenticated = response();
  await handler(
    { session: { userId: 42 }, query: { limit: '10' } },
    authenticated
  );
  assert.deepStrictEqual(requested, { userId: 42, limit: '10' });
  assert.deepStrictEqual(authenticated.body, {
    jobs: [{ id: 1, status: 'queued' }],
  });
  console.log('✓ background job visibility is authenticated and user-scoped');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
