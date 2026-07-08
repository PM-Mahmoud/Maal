'use strict';

// test/radar-mapping.test.js
// Deterministic tests for db/radar.js pure mappers behind /api/v1/alerts — the
// seam between the "radars"/"radar_events" rows and the React "alert" shape. No DB.

const assert = require('assert');
const { radarToAlert, eventToAlertEvent } = require('../db/radar');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nradarToAlert');

test('maps a radar row to the alert fields the page renders', () => {
  const a = radarToAlert({
    id: 7, prompt: 'Watch CBA', frequency: 'weekly',
    notify_email: true, notify_sms: false, active: true,
    symbols: ['CBA'], last_run_at: '2026-07-01',
  });
  assert.strictEqual(a.id, '7');
  assert.strictEqual(typeof a.id, 'string');
  assert.strictEqual(a.prompt, 'Watch CBA');
  assert.strictEqual(a.frequency, 'weekly');
  assert.strictEqual(a.notify_email, true);
  assert.strictEqual(a.notify_sms, false);
  assert.strictEqual(a.active, true);
  assert.deepStrictEqual(a.symbols, ['CBA']);
  assert.strictEqual(a.time_aest, null);
});

test('defaults: notify_email/active true unless explicitly false; symbols []', () => {
  const a = radarToAlert({ id: 1, prompt: 'x', frequency: 'daily' });
  assert.strictEqual(a.notify_email, true);
  assert.strictEqual(a.active, true);
  assert.strictEqual(a.notify_sms, false);
  assert.deepStrictEqual(a.symbols, []);
  const paused = radarToAlert({ id: 2, active: false, notify_email: false });
  assert.strictEqual(paused.active, false);
  assert.strictEqual(paused.notify_email, false);
});

console.log('\neventToAlertEvent');

test('maps a radar_events row to the event shape (radar_id → alert_id, summary → message)', () => {
  const e = eventToAlertEvent({ id: 11, radar_id: 7, alerted: true, summary: 'CBA down 6%', created_at: '2026-07-02' });
  assert.strictEqual(e.id, '11');
  assert.strictEqual(e.alert_id, '7');
  assert.strictEqual(e.message, 'CBA down 6%');
  assert.strictEqual(e.alerted, true);
  assert.strictEqual(e.created_at, '2026-07-02');
  assert.strictEqual(e.email_status, null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
