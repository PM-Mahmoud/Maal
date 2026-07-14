'use strict';
// Deterministic tests for lib/twilio-sms.js — signature validation (against
// Twilio's own documented vector), TwiML building, and message splitting.

const assert = require('assert');
const { validateTwilioSignature, expectedSignature, buildTwiml, splitSms, escapeXml } = require('../lib/twilio-sms');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\ntwilio inbound SMS helpers');

// Twilio's canonical example from the security docs.
const TW = {
  authToken: '12345',
  url: 'https://mycompany.com/myapp.php?foo=1&bar=2',
  params: {
    Digits: '1234',
    To: '+18005551212',
    From: '+14158675309',
    Caller: '+14158675309',
    CallSid: 'CA1234567890ABCDE',
  },
  // The expected signature for these exact inputs, per the twilio-node library's
  // own validateRequest test fixture.
  signature: 'RSOYDt4T1cUTdK1PDd93/VVr8B8=',
};

test('expectedSignature matches Twilio\'s documented example vector', () => {
  assert.strictEqual(expectedSignature(TW.authToken, TW.url, TW.params), TW.signature);
});

test('validateTwilioSignature accepts the correct signature', () => {
  assert.strictEqual(validateTwilioSignature(TW.authToken, TW.url, TW.params, TW.signature), true);
});

test('validateTwilioSignature rejects a tampered param', () => {
  const bad = { ...TW.params, Digits: '9999' };
  assert.strictEqual(validateTwilioSignature(TW.authToken, TW.url, bad, TW.signature), false);
});

test('validateTwilioSignature rejects a wrong auth token', () => {
  assert.strictEqual(validateTwilioSignature('wrong', TW.url, TW.params, TW.signature), false);
});

test('validateTwilioSignature rejects empty signature / token', () => {
  assert.strictEqual(validateTwilioSignature(TW.authToken, TW.url, TW.params, ''), false);
  assert.strictEqual(validateTwilioSignature('', TW.url, TW.params, TW.signature), false);
});

test('buildTwiml wraps and XML-escapes messages', () => {
  const xml = buildTwiml('Hi <there> & "you"');
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><Response>'));
  assert.ok(xml.includes('<Message>Hi &lt;there&gt; &amp; &quot;you&quot;</Message>'));
  assert.ok(xml.endsWith('</Response>'));
});

test('buildTwiml supports multiple messages and drops empties', () => {
  const xml = buildTwiml(['one', '', 'two', null]);
  assert.strictEqual((xml.match(/<Message>/g) || []).length, 2);
});

test('splitSms keeps short text as one chunk', () => {
  assert.deepStrictEqual(splitSms('short message'), ['short message']);
  assert.deepStrictEqual(splitSms(''), []);
});

test('splitSms breaks long text into <= max chunks on word boundaries', () => {
  const long = Array.from({ length: 500 }, (_, i) => 'word' + i).join(' ');
  const chunks = splitSms(long, 100);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 100, `chunk too long: ${c.length}`);
  // No words lost.
  assert.strictEqual(chunks.join(' ').split(/\s+/).length, 500);
});

test('escapeXml handles the five XML entities', () => {
  assert.strictEqual(escapeXml(`<>&"'`), '&lt;&gt;&amp;&quot;&apos;');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
