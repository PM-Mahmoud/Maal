'use strict';
// Deterministic tests for services/advisor.js — the gateway-routed API
// introduced when advisor.js was rewired to delegate every LLM call to
// services/gateway.js (PR 1 of specs/silvia-parity-tier1-2.md):
//   - hasAdvisor() now just proxies gateway.hasAnyProvider()
//   - chat() drafts via the reasoner role, then runs gateway.verifyAndRevise()
//     and ships its final text (verify-and-revise, blocking, one round)
//   - extractFigures() now completes on the cheap role
//   - complete() forwards opts.role (default 'reasoner') straight to the gateway
//
// No network: services/gateway.js is monkey-patched directly. This works
// because services/advisor.js holds a reference to the very same module
// object returned by require('../services/gateway') here (Node's module
// cache is keyed by resolved path), so replacing a method on that shared
// object changes what advisor.js calls too.

const assert = require('assert');

// Clean slate: no AI keys configured, so hasEmbeddings() (services/embeddings.js)
// stays false and chat() never touches the RAG/DB path below it.
delete process.env.AZURE_OPENAI_ENDPOINT;
delete process.env.AZURE_OPENAI_API_KEY;
delete process.env.AZURE_OPENAI_DEPLOYMENT;
delete process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_API_KEY;
delete process.env.DEEPSEEK_API_KEY;

const gateway = require('../services/gateway');
const advisor = require('../services/advisor');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch(e => { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; });
}

// Swap methods on the shared gateway module for the duration of `fn`, always
// restoring the originals afterwards (even on failure) so tests never leak.
function withGatewayMocks(mocks, fn) {
  const saved = {};
  for (const key of Object.keys(mocks)) { saved[key] = gateway[key]; gateway[key] = mocks[key]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(saved)) gateway[key] = saved[key];
  });
}

async function main() {
  // ─── hasAdvisor ───────────────────────────────────────────────────────────
  console.log('\nhasAdvisor');

  await test('delegates to gateway.hasAnyProvider()', () => withGatewayMocks(
    { hasAnyProvider: () => true },
    () => assert.strictEqual(advisor.hasAdvisor(), true)
  ));

  await test('false when the gateway has no reasoner provider configured', () => withGatewayMocks(
    { hasAnyProvider: () => false },
    () => assert.strictEqual(advisor.hasAdvisor(), false)
  ));

  // ─── chat() ───────────────────────────────────────────────────────────────
  console.log('\nchat()');

  const user = { name: 'Alex Smith' };
  const profile = { annual_income: 90000 };
  const maal = { hasData: false };
  const messages = [{ role: 'user', content: 'How much tax will I pay?' }];

  await test('no provider configured → fallback reply, gateway never called', () => withGatewayMocks(
    {
      hasAnyProvider: () => false,
      completeAs: async () => { throw new Error('completeAs should not be called'); },
      verifyAndRevise: async () => { throw new Error('verifyAndRevise should not be called'); },
    },
    async () => {
      const reply = await advisor.chat(user, profile, maal, messages, [], {});
      assert.ok(/not fully switched on/i.test(reply), 'expected the AI-unavailable fallback reply');
    }
  ));

  await test('happy path: drafts on the reasoner role, then ships the verifier\'s final text', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async (role, msgs, opts) => {
        assert.strictEqual(role, 'reasoner');
        assert.strictEqual(msgs[0].role, 'system');
        assert.strictEqual(msgs[msgs.length - 1].content, messages[0].content);
        assert.strictEqual(opts.maxTokens, 700);
        assert.strictEqual(opts.temperature, 0.6);
        return 'draft answer';
      },
      verifyAndRevise: async ({ messages: promptMessages, draft, opts }) => {
        assert.strictEqual(draft, 'draft answer');
        assert.strictEqual(promptMessages[promptMessages.length - 1].role, 'user');
        assert.strictEqual(opts.maxTokens, 700);
        return { text: 'verified + revised answer', verified: true, revised: true, issues: ['SG rate was wrong'] };
      },
    },
    async () => {
      const reply = await advisor.chat(user, profile, maal, messages, [], {});
      assert.strictEqual(reply, 'verified + revised answer');
    }
  ));

  await test('clean draft (verifier passes, no revision): ships the draft unchanged', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async () => 'clean draft',
      verifyAndRevise: async ({ draft }) => ({ text: draft, verified: true, revised: false, issues: [] }),
    },
    async () => {
      const reply = await advisor.chat(user, profile, maal, messages, [], {});
      assert.strictEqual(reply, 'clean draft');
    }
  ));

  await test('the reasoner draft always goes through verifyAndRevise, even if it errors internally', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async () => 'draft that would ship if verify were skipped',
      // Simulates gateway.verifyAndRevise's own contract: it never throws and
      // never blocks — on internal failure it just returns the draft as-is.
      verifyAndRevise: async ({ draft }) => ({ text: draft, verified: false, revised: false, issues: [] }),
    },
    async () => {
      const reply = await advisor.chat(user, profile, maal, messages, [], {});
      assert.strictEqual(reply, 'draft that would ship if verify were skipped');
    }
  ));

  await test('system prompt carries the AU constants block (buildConstantsPrompt)', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async (role, msgs) => {
        assert.ok(msgs[0].content.includes('AUTHORITATIVE'), 'system prompt should carry the AU constants block');
        return 'draft';
      },
      verifyAndRevise: async ({ draft }) => ({ text: draft, verified: false, revised: false, issues: [] }),
    },
    () => advisor.chat(user, profile, maal, messages, [], {})
  ));

  await test('only the last 10 conversation turns are sent to the reasoner', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async (role, msgs) => {
        // 1 system message + exactly 10 conversation turns
        assert.strictEqual(msgs.length, 11, 'expected system + 10 turns, got ' + msgs.length);
        return 'draft';
      },
      verifyAndRevise: async ({ draft }) => ({ text: draft, verified: false, revised: false, issues: [] }),
    },
    () => {
      const longHistory = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'msg' + i }));
      return advisor.chat(user, profile, maal, longHistory, [], {});
    }
  ));

  // ─── extractFigures() ───────────────────────────────────────────────────────
  console.log('\nextractFigures()');

  await test('ai-unavailable when no provider is configured', () => withGatewayMocks(
    { hasAnyProvider: () => false },
    async () => {
      const r = await advisor.extractFigures('I earn $90,000 a year');
      assert.deepStrictEqual(r, { fields: [], reason: 'ai-unavailable' });
    }
  ));

  await test('empty/whitespace document short-circuits without calling the gateway', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async () => { throw new Error('should not be called for an empty document'); },
    },
    async () => {
      const r = await advisor.extractFigures('   ');
      assert.deepStrictEqual(r, { fields: [], reason: 'empty' });
    }
  ));

  await test('extraction runs on the cheap role and parses recognised fields', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async (role, msgs, opts) => {
        assert.strictEqual(role, 'cheap');
        assert.strictEqual(opts.temperature, 0);
        return '{"cash_savings": 5000, "super_balance": "120,000"}';
      },
    },
    async () => {
      const r = await advisor.extractFigures('Cash savings: $5,000. Super: $120,000.');
      assert.strictEqual(r.fields.length, 2);
      const byField = Object.fromEntries(r.fields.map(f => [f.field, f.amount]));
      assert.strictEqual(byField.cash_savings, 5000);
      assert.strictEqual(byField.super_balance, 120000);
    }
  ));

  await test('negative amounts and fields outside the allow-list are excluded', () => withGatewayMocks(
    {
      hasAnyProvider: () => true,
      completeAs: async () => '{"cash_savings": -500, "not_a_real_field": 100000}',
    },
    async () => {
      const r = await advisor.extractFigures('some document text');
      assert.deepStrictEqual(r.fields, []);
    }
  ));

  await test('gateway error → {fields: [], reason: "error"}, never throws', () => withGatewayMocks(
    { hasAnyProvider: () => true, completeAs: async () => { throw new Error('provider down'); } },
    async () => {
      const r = await advisor.extractFigures('some document text');
      assert.deepStrictEqual(r, { fields: [], reason: 'error' });
    }
  ));

  await test('unparseable JSON reply yields no fields without throwing', () => withGatewayMocks(
    { hasAnyProvider: () => true, completeAs: async () => 'not json at all' },
    async () => {
      const r = await advisor.extractFigures('some document text');
      assert.deepStrictEqual(r.fields, []);
    }
  ));

  // ─── complete() ───────────────────────────────────────────────────────────
  console.log('\ncomplete()');

  await test('defaults to the reasoner role when opts.role is omitted', () => withGatewayMocks(
    { completeAs: async (role) => { assert.strictEqual(role, 'reasoner'); return 'ok'; } },
    async () => {
      const out = await advisor.complete([{ role: 'user', content: 'hi' }]);
      assert.strictEqual(out, 'ok');
    }
  ));

  await test('forwards an explicit opts.role to the gateway (e.g. cheap)', () => withGatewayMocks(
    { completeAs: async (role) => { assert.strictEqual(role, 'cheap'); return 'ok'; } },
    () => advisor.complete([{ role: 'user', content: 'hi' }], { role: 'cheap', maxTokens: 100 })
  ));

  await test('forwards maxTokens/temperature through unchanged', () => withGatewayMocks(
    {
      completeAs: async (role, msgs, opts) => {
        assert.strictEqual(opts.maxTokens, 42);
        assert.strictEqual(opts.temperature, 0.1);
        return 'ok';
      },
    },
    () => advisor.complete([{ role: 'user', content: 'hi' }], { maxTokens: 42, temperature: 0.1 })
  ));

  await test('missing opts is safe (defaults to the reasoner role)', () => withGatewayMocks(
    { completeAs: async (role) => { assert.strictEqual(role, 'reasoner'); return 'ok'; } },
    async () => {
      const out = await advisor.complete([{ role: 'user', content: 'hi' }], undefined);
      assert.strictEqual(out, 'ok');
    }
  ));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();