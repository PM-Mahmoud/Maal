'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const redirectDashboard = require('../routes/dashboard-redirect');

function redirect(path, originalUrl) {
  let result;
  redirectDashboard({ path, originalUrl }, {
    redirect(status, location) { result = { status, location }; },
  });
  return result;
}

test('legacy transaction redirects preserve the original encoded query and duplicate keys', () => {
  const query = '?basiq=queued&tag=one%20two&tag=three%2Bfour';
  assert.deepEqual(redirect('/transactions/', '/dashboard/transactions/' + query), {
    status: 301,
    location: '/app/transactions' + query,
  });
});

test('legacy dashboard fallback preserves the query and ordinary redirects still work', () => {
  assert.deepEqual(redirect('/old', '/dashboard/old?tab=1'), { status: 301, location: '/app?tab=1' });
  assert.deepEqual(redirect('/assets', '/dashboard/assets'), { status: 301, location: '/app/assets' });
});
