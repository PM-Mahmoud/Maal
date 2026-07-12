'use strict';
// Deterministic tests for services/advisor-memory.js — the cross-session memory
// synthesis. No network: the gateway's fetch is stubbed. Focus on the safety
// guards (PII redaction, debounce) and the merge contract.

const assert = require('assert');

process.env.GROQ_API_KEY = 'groq-test-key'; // gives the cheap role a provider
const gateway = require('../services/gateway');
const mem = require('../services/advisor-memory');

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { console.log('  ✓ ' + name); passed++; })
    .catch((e) => { console.error('  ✗ ' + name); console.error('    ' + e.message); failed++; });
}

async function main() {
  console.log('\nredactSensitive (never store account numbers or balances)');

  await test('strips long digit runs, BSBs, and dollar amounts', () => {
    const dirty = 'Account 123456789 (BSB 062-000) holds $12,500.50 and card 4111 1111 1111 1111.';
    const clean = mem.redactSensitive(dirty);
    assert.ok(!/123456789/.test(clean), 'account number removed');
    assert.ok(!/062-000/.test(clean), 'BSB removed');
    assert.ok(!/\$12,500/.test(clean), 'balance removed');
    assert.ok(!/4111 1111 1111 1111/.test(clean), 'card number removed');
    assert.ok(clean.includes('[amount]') || clean.includes('[redacted]'));
  });

  await test('leaves ordinary prose untouched', () => {
    const s = 'Prefers ETFs, dislikes crypto. Planning to buy a home in 2028.';
    assert.strictEqual(mem.redactSensitive(s), s);
  });

  console.log('\nshouldMerge (debounce)');

  await test('merges when never merged before', () => {
    assert.strictEqual(mem.shouldMerge(null), true);
  });

  await test('does not merge again immediately, but does after the window', () => {
    assert.strictEqual(mem.shouldMerge(new Date().toISOString()), false);
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    assert.strictEqual(mem.shouldMerge(old), true);
  });

  console.log('\ntranscriptFromMessages');

  await test('formats only user/assistant turns with speaker labels', () => {
    const t = mem.transcriptFromMessages([
      { role: 'system', content: 'ignore me' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: '' },
    ]);
    assert.ok(t.includes('User: hello'));
    assert.ok(t.includes('Maal: hi there'));
    assert.ok(!t.includes('ignore me'));
  });

  console.log('\nmergeMemory');

  await test('returns redacted merged memory from the cheap model', async () => {
    let sawSystem = false;
    gateway._setFetchForTests(async (url, init) => {
      assert.ok(url.includes('groq.com'), 'uses the cheap (Groq) provider');
      const body = JSON.parse(init.body);
      sawSystem = body.messages[0].role === 'system' && /memory/i.test(body.messages[0].content);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '## Personal context\n- Planning to buy a home\n- Balance is $99,999' } }] }), text: async () => '' };
    });
    const out = await mem.mergeMemory('(empty)', 'User: I want to buy a house. My balance is $99,999.');
    assert.ok(sawSystem, 'system prompt describes the memory task');
    assert.ok(out.includes('Planning to buy a home'));
    assert.ok(!out.includes('$99,999'), 'balance redacted from stored memory');
    gateway._setFetchForTests(null);
  });

  await test('empty transcript → null (no model call)', async () => {
    gateway._setFetchForTests(async () => { throw new Error('should not be called'); });
    assert.strictEqual(await mem.mergeMemory('x', '   '), null);
    gateway._setFetchForTests(null);
  });

  await test('model error → null (never throws, keeps old memory)', async () => {
    gateway._setFetchForTests(async () => { throw new Error('groq down'); });
    assert.strictEqual(await mem.mergeMemory('old', 'User: hi'), null);
    gateway._setFetchForTests(null);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
}

main();
