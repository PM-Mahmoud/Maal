'use strict';
// Deterministic tests for services/gateway.js — role resolution, provider
// adapters, and the verify-and-revise pass. No network: fetch is stubbed.
// Includes the advisor-eval case from the spec: the verifier must catch a
// planted wrong SG rate and trigger exactly one revision round.

const assert = require('assert');

// Fixture env BEFORE requiring the module (config is read per call, but be safe)
process.env.AZURE_OPENAI_ENDPOINT = 'https://unit-test.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'azure-test-key';
process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-test';
process.env.GROQ_API_KEY = 'groq-test-key';
process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
delete process.env.ANTHROPIC_MODEL;
delete process.env.GATEWAY_BASE_URL;
delete process.env.GATEWAY_API_KEY;
delete process.env.AI_API_KEY;
delete process.env.LLM_MODEL_STRONG;

const gateway = require('../services/gateway');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch(e => { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; });
}

function okJson(payload) {
  return { ok: true, json: async () => payload, text: async () => JSON.stringify(payload) };
}
function openaiReply(text) {
  return okJson({ choices: [{ message: { content: text } }] });
}
function anthropicReply(text) {
  return okJson({ content: [{ type: 'text', text }] });
}

async function main() {
  // ─── Role resolution ────────────────────────────────────────────────────────
  console.log('\nrole resolution');

  await test('reasoner → Azure, cheap → Groq, verifier → Anthropic claude-sonnet-5', () => {
    assert.strictEqual(gateway.resolveRole('reasoner').kind, 'azure');
    const cheap = gateway.resolveRole('cheap');
    assert.strictEqual(cheap.kind, 'openai');
    assert.ok(cheap.baseURL.includes('api.groq.com'));
    const v = gateway.resolveRole('verifier');
    assert.strictEqual(v.kind, 'anthropic');
    assert.strictEqual(v.model, 'claude-sonnet-5');
  });

  await test('graceful degradation: no ANTHROPIC_API_KEY → verifier role absent, others unaffected', () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    assert.strictEqual(gateway.resolveRole('verifier'), null);
    assert.strictEqual(gateway.hasRole('verifier'), false);
    assert.strictEqual(gateway.hasAnyProvider(), true);
    process.env.ANTHROPIC_API_KEY = saved;
  });

  await test('no Groq → cheap falls back to Azure cheap deployment', () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    assert.strictEqual(gateway.resolveRole('cheap').kind, 'azure');
    process.env.GROQ_API_KEY = saved;
  });

  await test('ANTHROPIC_MODEL env overrides the verifier model', () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-4-8';
    assert.strictEqual(gateway.resolveRole('verifier').model, 'claude-opus-4-8');
    delete process.env.ANTHROPIC_MODEL;
  });

  await test('GATEWAY_BASE_URL override routes every role to the proxy (LiteLLM graduation path)', () => {
    process.env.GATEWAY_BASE_URL = 'https://litellm.internal';
    process.env.GATEWAY_API_KEY = 'proxy-key';
    process.env.GATEWAY_MODEL = 'default-model';
    process.env.GATEWAY_MODEL_VERIFIER = 'verifier-model';
    for (const role of ['reasoner', 'cheap', 'verifier']) {
      const cfg = gateway.resolveRole(role);
      assert.strictEqual(cfg.kind, 'openai');
      assert.strictEqual(cfg.baseURL, 'https://litellm.internal');
    }
    assert.strictEqual(gateway.resolveRole('verifier').model, 'verifier-model');
    assert.strictEqual(gateway.resolveRole('reasoner').model, 'default-model');
    delete process.env.GATEWAY_BASE_URL;
    delete process.env.GATEWAY_API_KEY;
    delete process.env.GATEWAY_MODEL;
    delete process.env.GATEWAY_MODEL_VERIFIER;
  });

  // ─── Adapters ───────────────────────────────────────────────────────────────
  console.log('\nprovider adapters');

  await test('completeAs(cheap) posts OpenAI-shape to Groq with Bearer auth', async () => {
    let captured;
    gateway._setFetchForTests(async (url, init) => { captured = { url, init }; return openaiReply('hi'); });
    const out = await gateway.completeAs('cheap', [{ role: 'user', content: 'ping' }], { maxTokens: 50 });
    assert.strictEqual(out, 'hi');
    assert.ok(captured.url.startsWith('https://api.groq.com/openai/v1/chat/completions'));
    assert.strictEqual(captured.init.headers.Authorization, 'Bearer groq-test-key');
    gateway._setFetchForTests(null);
  });

  await test('completeAs(verifier) hoists system prompt to Anthropic top-level `system` field', async () => {
    let captured;
    gateway._setFetchForTests(async (url, init) => { captured = { url, body: JSON.parse(init.body), headers: init.headers }; return anthropicReply('{"pass": true}'); });
    await gateway.completeAs('verifier', [
      { role: 'system', content: 'you are a checker' },
      { role: 'user', content: 'check this' },
    ], { maxTokens: 50 });
    assert.ok(captured.url.includes('api.anthropic.com/v1/messages'));
    assert.strictEqual(captured.headers['x-api-key'], 'anthropic-test-key');
    assert.strictEqual(captured.body.system, 'you are a checker');
    assert.deepStrictEqual(captured.body.messages, [{ role: 'user', content: 'check this' }]);
    gateway._setFetchForTests(null);
  });

  // ─── Verify-and-revise ──────────────────────────────────────────────────────
  console.log('\nverify-and-revise');

  const groundedMessages = [
    { role: 'system', content: 'FY2026-27 constants: Super SG rate 12.0% (final). User data: income $90,000.' },
    { role: 'user', content: 'How much super does my employer pay?' },
  ];

  await test('EVAL: verifier catches a planted wrong SG rate → one revision round → revised text ships', async () => {
    const calls = [];
    gateway._setFetchForTests(async (url, init) => {
      calls.push(url);
      if (url.includes('anthropic')) {
        return anthropicReply('{"pass": false, "issues": ["Draft says SG is 11% — the authoritative constant is 12.0%"]}');
      }
      // revision call → reasoner (Azure)
      const body = JSON.parse(init.body);
      const critique = body.messages[body.messages.length - 1].content;
      assert.ok(critique.includes('12.0%'), 'revision prompt must carry the issue');
      return openaiReply('Your employer pays 12% of your salary into super.');
    });
    const r = await gateway.verifyAndRevise({
      messages: groundedMessages,
      draft: 'Your employer pays 11% of your salary into super.',
      opts: { maxTokens: 200 },
    });
    assert.strictEqual(r.verified, true);
    assert.strictEqual(r.revised, true);
    assert.strictEqual(r.issues.length, 1);
    assert.ok(r.text.includes('12%'));
    assert.strictEqual(calls.filter(u => u.includes('anthropic')).length, 1, 'exactly one verifier call');
    assert.strictEqual(calls.filter(u => !u.includes('anthropic')).length, 1, 'exactly one revision round');
    gateway._setFetchForTests(null);
  });

  await test('clean draft: pass → no revision, draft ships', async () => {
    gateway._setFetchForTests(async (url) => {
      assert.ok(url.includes('anthropic'), 'only the verifier should be called');
      return anthropicReply('{"pass": true}');
    });
    const r = await gateway.verifyAndRevise({ messages: groundedMessages, draft: 'Your employer pays 12%.', opts: {} });
    assert.strictEqual(r.verified, true);
    assert.strictEqual(r.revised, false);
    assert.strictEqual(r.text, 'Your employer pays 12%.');
    gateway._setFetchForTests(null);
  });

  await test('no verifier key: pass is skipped, draft ships untouched', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    gateway._setFetchForTests(async () => { throw new Error('no network call expected'); });
    const r = await gateway.verifyAndRevise({ messages: groundedMessages, draft: 'draft text', opts: {} });
    assert.strictEqual(r.verified, false);
    assert.strictEqual(r.text, 'draft text');
    process.env.ANTHROPIC_API_KEY = saved;
    gateway._setFetchForTests(null);
  });

  await test('verifier error: never blocks — draft ships', async () => {
    gateway._setFetchForTests(async () => { throw new Error('anthropic down'); });
    const r = await gateway.verifyAndRevise({ messages: groundedMessages, draft: 'draft text', opts: {} });
    assert.strictEqual(r.text, 'draft text');
    assert.strictEqual(r.revised, false);
    gateway._setFetchForTests(null);
  });

  await test('unparseable verifier output: draft ships', async () => {
    gateway._setFetchForTests(async () => anthropicReply('I think it looks fine!'));
    const r = await gateway.verifyAndRevise({ messages: groundedMessages, draft: 'draft text', opts: {} });
    assert.strictEqual(r.verified, false);
    assert.strictEqual(r.text, 'draft text');
    gateway._setFetchForTests(null);
  });

  await test('empty revision result: original draft ships', async () => {
    gateway._setFetchForTests(async (url) =>
      url.includes('anthropic')
        ? anthropicReply('{"pass": false, "issues": ["x is wrong"]}')
        : openaiReply('')
    );
    const r = await gateway.verifyAndRevise({ messages: groundedMessages, draft: 'draft text', opts: {} });
    assert.strictEqual(r.text, 'draft text');
    assert.strictEqual(r.revised, false);
    gateway._setFetchForTests(null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
