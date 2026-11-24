const { test } = require('node:test');
const assert = require('node:assert/strict');

test('usage-limit handling recognises the structured 402 and keeps its member-facing explanation', async () => {
  const { UsageLimitError, usageLimitError } = await import('../client/src/lib/usage-limit.mjs');
  const limit = usageLimitError(402, {
    code: 'usage_limit',
    error: 'You’ve used this month’s research reports. Your usage resets on the 1st.',
  });
  assert.ok(limit instanceof UsageLimitError);
  assert.match(limit.message, /usage resets on the 1st/);
  assert.equal(usageLimitError(402, { code: 'payment_failed' }), null);
  assert.equal(usageLimitError(500, { code: 'usage_limit' }), null);
  assert.equal(usageLimitError(402, null), null);
  assert.equal(usageLimitError(402, { code: 'usage_limit', error: {} }).message, 'You’ve reached your plan’s usage limit.');
});
