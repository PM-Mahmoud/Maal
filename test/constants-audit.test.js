'use strict';
// Deterministic tests for services/constants-audit.js — the monthly AU
// constants drift-check (decision 12, specs/silvia-parity-tier1-2.md).
// PROPOSE-ONLY: it must never throw on a bad upstream response, and it must
// degrade gracefully (skip) when EXA_API_KEY or a cheap-role model is missing.
// No real network: global.fetch (Exa) and gateway.completeAs/hasRole
// (the cheap model) are stubbed.

const assert = require('assert');

const gateway = require('../services/gateway');
const { getConstants } = require('../lib/au-constants');
const constantsAudit = require('../services/constants-audit');

const EXA_QUERIES = {
  incomeTax: 'individual income tax rates and brackets for Australian residents current financial year',
  hecs: 'study and training support loans HELP compulsory repayment threshold and rates current financial year',
  superCaps: 'superannuation concessional and non-concessional contributions caps current financial year',
  mls: 'Medicare levy surcharge income thresholds and rates current financial year',
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch(e => { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; });
}

function withGatewayMocks(mocks, fn) {
  const saved = {};
  for (const key of Object.keys(mocks)) { saved[key] = gateway[key]; gateway[key] = mocks[key]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(saved)) gateway[key] = saved[key];
  });
}

const originalFetch = global.fetch;
function withFetchStub(stub, fn) {
  global.fetch = stub;
  return Promise.resolve().then(fn).finally(() => { global.fetch = originalFetch; });
}

function withEnv(vars, fn) {
  const saved = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

// Builds an Exa-shaped fetch stub. `highlightsByQuery` maps a topic's exact
// query string to a single highlight string (omit for "no results"); pass a
// query string in `failFor` to simulate an upstream HTTP error for that topic.
function exaStub(highlightsByQuery, { failFor } = {}) {
  return async (url, init) => {
    assert.strictEqual(url, 'https://api.exa.ai/search');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers['x-api-key'], (process.env.EXA_API_KEY || '').trim());
    const body = JSON.parse(init.body);
    assert.deepStrictEqual(body.includeDomains, ['ato.gov.au']);
    assert.strictEqual(body.type, 'auto');
    if (failFor && body.query === failFor) {
      return { ok: false, status: 500, text: async () => 'exa outage' };
    }
    const highlight = highlightsByQuery[body.query];
    const results = highlight ? [{ title: 'ATO', url: 'https://ato.gov.au/x', highlights: [highlight] }] : [];
    return { ok: true, json: async () => ({ results }) };
  };
}

function topicById(report, id) { return report.topics.find(t => t.id === id); }

async function main() {
  // ─── hasExa ─────────────────────────────────────────────────────────────────
  console.log('\nhasExa');

  await test('true when EXA_API_KEY is set', () => withEnv({ EXA_API_KEY: 'exa-test-key' }, () => {
    assert.strictEqual(constantsAudit.hasExa(), true);
  }));

  await test('false when EXA_API_KEY is unset or blank', () => withEnv({ EXA_API_KEY: undefined }, () => {
    assert.strictEqual(constantsAudit.hasExa(), false);
    return withEnv({ EXA_API_KEY: '   ' }, () => {
      assert.strictEqual(constantsAudit.hasExa(), false);
    });
  }));

  // ─── Graceful degradation (propose-only, never a hard failure) ─────────────
  console.log('\nrunDriftCheck — graceful degradation');

  await test('no EXA_API_KEY → skipped, no network or gateway calls made', () => withEnv(
    { EXA_API_KEY: undefined },
    () => withFetchStub(
      async () => { throw new Error('fetch should not be called'); },
      () => withGatewayMocks(
        { completeAs: async () => { throw new Error('completeAs should not be called'); } },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          assert.deepStrictEqual(report, { skipped: 'EXA_API_KEY not configured' });
        }
      )
    )
  ));

  await test('EXA_API_KEY set but no cheap-role model → skipped before any Exa search', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      async () => { throw new Error('fetch should not be called'); },
      () => withGatewayMocks(
        { hasRole: role => { assert.strictEqual(role, 'cheap'); return false; } },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          assert.deepStrictEqual(report, { skipped: 'no cheap-role model configured' });
        }
      )
    )
  ));

  // ─── Happy path ─────────────────────────────────────────────────────────────
  console.log('\nrunDriftCheck — happy path');

  await test('clean run: no discrepancies across all four topics', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub({
        [EXA_QUERIES.incomeTax]: 'Tax brackets unchanged from stored constants.',
        [EXA_QUERIES.hecs]: 'HECS thresholds unchanged from stored constants.',
        [EXA_QUERIES.superCaps]: 'Super caps unchanged from stored constants.',
        [EXA_QUERIES.mls]: 'MLS thresholds unchanged from stored constants.',
      }),
      () => withGatewayMocks(
        {
          hasRole: () => true,
          completeAs: async (role, msgs) => {
            assert.strictEqual(role, 'cheap');
            assert.ok(msgs[1].content.includes('<stored_constants>'));
            assert.ok(msgs[1].content.includes('<official_excerpts>'));
            return '{"discrepancies": []}';
          },
        },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          assert.strictEqual(report.fy, getConstants().fy);
          assert.ok(!Number.isNaN(Date.parse(report.checkedAt)), 'checkedAt should be a parseable date');
          assert.strictEqual(report.topics.length, 4);
          assert.deepStrictEqual(report.discrepancies, []);
          for (const t of report.topics) {
            assert.strictEqual(t.sources, 1);
            assert.strictEqual(t.discrepancies, 0);
          }
        }
      )
    )
  ));

  await test('a planted discrepancy on one topic is surfaced with its topic id and source', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub({
        [EXA_QUERIES.incomeTax]: 'Tax brackets unchanged from stored constants.',
        [EXA_QUERIES.hecs]: 'The HELP repayment threshold is now $999,999 (FAKE_WRONG_RATE marker for this test).',
        [EXA_QUERIES.superCaps]: 'Super caps unchanged from stored constants.',
        [EXA_QUERIES.mls]: 'MLS thresholds unchanged from stored constants.',
      }),
      () => withGatewayMocks(
        {
          hasRole: () => true,
          completeAs: async (role, msgs) => {
            const evidence = msgs[1].content;
            if (evidence.includes('FAKE_WRONG_RATE')) {
              return JSON.stringify({
                discrepancies: [{ stored: 'HELP threshold $69,528', found: '$999,999', source: 'https://ato.gov.au/x' }],
              });
            }
            return '{"discrepancies": []}';
          },
        },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          assert.strictEqual(topicById(report, 'hecs').discrepancies, 1);
          assert.strictEqual(topicById(report, 'income-tax').discrepancies, 0);
          assert.strictEqual(topicById(report, 'super-caps').discrepancies, 0);
          assert.strictEqual(topicById(report, 'mls').discrepancies, 0);
          assert.strictEqual(report.discrepancies.length, 1);
          assert.deepStrictEqual(report.discrepancies[0], {
            topic: 'hecs',
            stored: 'HELP threshold $69,528',
            found: '$999,999',
            source: 'https://ato.gov.au/x',
          });
        }
      )
    )
  ));

  await test('a topic with no Exa results is skipped without calling the cheap model', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub({}), // no highlights configured → every topic returns zero results
      () => withGatewayMocks(
        { hasRole: () => true, completeAs: async () => { throw new Error('completeAs should not be called'); } },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          assert.strictEqual(report.topics.length, 4);
          for (const t of report.topics) {
            assert.strictEqual(t.sources, 0);
            assert.strictEqual('discrepancies' in t, false, 'a zero-source topic has no discrepancies field');
          }
          assert.deepStrictEqual(report.discrepancies, []);
          // A sweep where nothing could be checked must be inconclusive, not clean.
          assert.strictEqual(report.status, 'inconclusive');
          assert.strictEqual(report.failures, 4);
        }
      )
    )
  ));

  await test('an Exa HTTP error on one topic is captured without aborting the sweep', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub(
        {
          [EXA_QUERIES.incomeTax]: 'Tax brackets unchanged from stored constants.',
          [EXA_QUERIES.superCaps]: 'Super caps unchanged from stored constants.',
          [EXA_QUERIES.mls]: 'MLS thresholds unchanged from stored constants.',
        },
        { failFor: EXA_QUERIES.hecs }
      ),
      () => withGatewayMocks(
        { hasRole: () => true, completeAs: async () => '{"discrepancies": []}' },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          const hecsTopic = topicById(report, 'hecs');
          assert.ok(hecsTopic.error && hecsTopic.error.includes('Exa 500'), 'expected the Exa error to be captured');
          assert.strictEqual(topicById(report, 'income-tax').sources, 1);
          assert.deepStrictEqual(report.discrepancies, []);
          // One failed topic ⇒ the whole sweep is inconclusive, never clean.
          assert.strictEqual(report.status, 'inconclusive');
          assert.ok(report.failures >= 1);
        }
      )
    )
  ));

  await test('the cheap model erroring on one topic is captured without aborting the sweep', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub({ [EXA_QUERIES.incomeTax]: 'Tax brackets unchanged from stored constants.' }),
      () => withGatewayMocks(
        { hasRole: () => true, completeAs: async () => { throw new Error('cheap model rate limited'); } },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          const incomeTaxTopic = topicById(report, 'income-tax');
          assert.strictEqual(incomeTaxTopic.sources, 1);
          assert.ok(incomeTaxTopic.error && incomeTaxTopic.error.includes('rate limited'));
          for (const id of ['hecs', 'super-caps', 'mls']) {
            assert.strictEqual(topicById(report, id).sources, 0); // no highlight configured for these
          }
          assert.deepStrictEqual(report.discrepancies, []);
          assert.strictEqual(report.status, 'inconclusive');
          assert.strictEqual(report.failures, 4); // 1 model error + 3 no-source
        }
      )
    )
  ));

  await test('unparseable JSON from the cheap model is INCONCLUSIVE (never silently clean), never throws', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub({ [EXA_QUERIES.incomeTax]: 'Tax brackets unchanged from stored constants.' }),
      () => withGatewayMocks(
        { hasRole: () => true, completeAs: async () => 'That all looks correct to me!' },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          const incomeTaxTopic = topicById(report, 'income-tax');
          assert.strictEqual(incomeTaxTopic.sources, 1);
          // Unparseable output must NOT be reported as a checked/clean topic —
          // the model may have flagged a real drift we couldn't read.
          assert.strictEqual(incomeTaxTopic.status, 'unparseable');
          assert.strictEqual('discrepancies' in incomeTaxTopic, false);
          assert.deepStrictEqual(report.discrepancies, []);
          assert.strictEqual(report.status, 'inconclusive');
          assert.ok(report.failures >= 1);
        }
      )
    )
  ));

  await test('report status is clean ONLY when every topic checked with no discrepancies', () => withEnv(
    { EXA_API_KEY: 'exa-test-key' },
    () => withFetchStub(
      exaStub({
        [EXA_QUERIES.incomeTax]: 'Tax brackets unchanged from stored constants.',
        [EXA_QUERIES.hecs]: 'HELP thresholds unchanged from stored constants.',
        [EXA_QUERIES.superCaps]: 'Super caps unchanged from stored constants.',
        [EXA_QUERIES.mls]: 'MLS thresholds unchanged from stored constants.',
      }),
      () => withGatewayMocks(
        { hasRole: () => true, completeAs: async () => '{"discrepancies": []}' },
        async () => {
          const report = await constantsAudit.runDriftCheck();
          assert.strictEqual(report.status, 'clean');
          assert.strictEqual(report.failures, 0);
        }
      )
    )
  ));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();