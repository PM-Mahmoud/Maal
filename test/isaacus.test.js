'use strict';

// test/isaacus.test.js
// Deterministic tests for services/isaacus.js — no real network calls, no
// ISAACUS_API_KEY required. Mocks global.fetch, same pattern as
// test/basiq-sync.test.js. Per CLAUDE.md hard rules: any code that shapes
// data for/from a third-party integration needs a test before merge.

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (e) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (e) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

async function withMockedFetch(mockImpl, fn) {
  const original = global.fetch;
  global.fetch = mockImpl;
  try {
    process.env.ISAACUS_API_KEY = 'test-key-not-real';
    delete require.cache[require.resolve('../services/isaacus')];
    const isaacus = require('../services/isaacus');
    await fn(isaacus);
  } finally {
    global.fetch = original;
    delete process.env.ISAACUS_API_KEY;
    delete require.cache[require.resolve('../services/isaacus')];
  }
}

// \u2500\u2500\u2500 hasIsaacus \u2500\u2500\u2500
console.log('\nhasIsaacus');

test('false when ISAACUS_API_KEY is unset', () => {
  delete process.env.ISAACUS_API_KEY;
  delete require.cache[require.resolve('../services/isaacus')];
  const isaacus = require('../services/isaacus');
  assert.strictEqual(isaacus.hasIsaacus(), false);
});

test('true when ISAACUS_API_KEY is set', () => {
  process.env.ISAACUS_API_KEY = 'sk-test-123';
  delete require.cache[require.resolve('../services/isaacus')];
  const isaacus = require('../services/isaacus');
  assert.strictEqual(isaacus.hasIsaacus(), true);
  delete process.env.ISAACUS_API_KEY;
  delete require.cache[require.resolve('../services/isaacus')];
});

// \u2500\u2500\u2500 classify / classifyLegalIntent \u2500\u2500\u2500
console.log('\nclassify');

(async () => {
  await testAsync('classify() sends Bearer auth and the query/texts shape', async () => {
    let capturedUrl, capturedOpts;
    await withMockedFetch(
      async (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
        return { ok: true, status: 200, text: async () => JSON.stringify({ classifications: [{ score: 0.87 }] }) };
      },
      async (isaacus) => {
        const score = await isaacus.classify('is this about tax?', 'my question about HECS');
        assert.strictEqual(score, 0.87);
        assert.strictEqual(capturedUrl, 'https://api.isaacus.com/v1/classifications/universal');
        assert.strictEqual(capturedOpts.headers['Authorization'], 'Bearer test-key-not-real');
        const body = JSON.parse(capturedOpts.body);
        assert.strictEqual(body.model, 'kanon-universal-classifier');
        assert.strictEqual(body.query, 'is this about tax?');
        assert.deepStrictEqual(body.texts, ['my question about HECS']);
      }
    );
  });

  await testAsync('classify() returns 0 when no classification is returned', async () => {
    await withMockedFetch(
      async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ classifications: [] }) }),
      async (isaacus) => {
        const score = await isaacus.classify('q', 't');
        assert.strictEqual(score, 0);
      }
    );
  });

  await testAsync('classifyLegalIntent() delegates to classify with a fixed legal-intent query', async () => {
    let capturedBody;
    await withMockedFetch(
      async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, text: async () => JSON.stringify({ classifications: [{ score: 0.6 }] }) };
      },
      async (isaacus) => {
        const score = await isaacus.classifyLegalIntent('can my landlord raise rent mid-lease?');
        assert.strictEqual(score, 0.6);
        assert.strictEqual(capturedBody.texts[0], 'can my landlord raise rent mid-lease?');
        assert.match(capturedBody.query, /legal, tax, tenancy, contract, or regulatory question/);
      }
    );
  });

  // \u2500\u2500\u2500 extractAnswer \u2500\u2500\u2500
  console.log('\nextractAnswer');

  await testAsync('returns null immediately when texts array is empty (no network call)', async () => {
    let fetchCalled = false;
    await withMockedFetch(
      async () => { fetchCalled = true; return { ok: true, status: 200, text: async () => '{}' }; },
      async (isaacus) => {
        const result = await isaacus.extractAnswer('what is the rent?', []);
        assert.strictEqual(result, null);
        assert.strictEqual(fetchCalled, false);
      }
    );
  });

  await testAsync('returns null when inextractability_score says no answer exists in the document', async () => {
    await withMockedFetch(
      async () => ({
        ok: true, status: 200,
        text: async () => JSON.stringify({
          extractions: [{ answers: [{ text: 'unrelated snippet', score: 0.4 }], inextractability_score: 0.92 }],
        }),
      }),
      async (isaacus) => {
        const result = await isaacus.extractAnswer('what is the rent?', ['lease text']);
        assert.strictEqual(result, null);
      }
    );
  });

  // Regression test: real API call on 2026-07-02 against a lease document
  // that DOES contain the answer returned an answers[].score of only 0.1846
  // — the original implementation gated on that score with minScore: 0.2 and
  // silently discarded a correct answer. inextractability_score (0.0037,
  // i.e. 99.6% confident an answer exists) is the right gate; answers[].score
  // is a ranking signal, not a 0-1 confidence value.
  await testAsync('does NOT discard a low answers[].score when inextractability_score confirms a real answer exists', async () => {
    await withMockedFetch(
      async () => ({
        ok: true, status: 200,
        text: async () => JSON.stringify({
          extractions: [{
            answers: [{
              text: 'The landlord may not increase rent during a fixed term unless the agreement expressly provides for it.',
              score: 0.1846,
            }],
            inextractability_score: 0.0037,
          }],
        }),
      }),
      async (isaacus) => {
        const result = await isaacus.extractAnswer('Can the landlord increase the rent during the fixed term?', ['lease text']);
        assert.ok(result, 'expected a real answer, got null');
        assert.match(result.text, /may not increase rent during a fixed term/);
      }
    );
  });

  await testAsync('picks the best-scoring answer across multiple source documents', async () => {
    await withMockedFetch(
      async () => ({
        ok: true, status: 200,
        text: async () => JSON.stringify({
          extractions: [
            { answers: [{ text: 'weak match', score: 0.3 }] },
            { answers: [{ text: '$650 per week', score: 0.91 }] },
          ],
        }),
      }),
      async (isaacus) => {
        const result = await isaacus.extractAnswer('what is the weekly rent?', ['doc one', 'doc two']);
        assert.strictEqual(result.text, '$650 per week');
        assert.strictEqual(result.score, 0.91);
        assert.strictEqual(result.sourceIndex, 1);
      }
    );
  });

  await testAsync('sends texts truncated per-document and the extraction model name', async () => {
    let capturedBody;
    await withMockedFetch(
      async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, text: async () => JSON.stringify({ extractions: [{ answers: [{ text: 'x', score: 0.9 }] }] }) };
      },
      async (isaacus) => {
        await isaacus.extractAnswer('q', ['short doc']);
        assert.strictEqual(capturedBody.model, 'kanon-answer-extractor');
        assert.strictEqual(capturedBody.query, 'q');
        assert.deepStrictEqual(capturedBody.texts, ['short doc']);
      }
    );
  });

  // \u2500\u2500\u2500 error handling \u2500\u2500\u2500
  console.log('\nerror handling');

  await testAsync('throws with status + path + detail on non-2xx', async () => {
    await withMockedFetch(
      async () => ({
        ok: false, status: 401,
        text: async () => JSON.stringify({ detail: 'Invalid API key' }),
      }),
      async (isaacus) => {
        await assert.rejects(
          () => isaacus.classify('q', 't'),
          (err) => {
            assert.match(err.message, /Isaacus 401 on \/classifications\/universal/);
            assert.match(err.message, /Invalid API key/);
            return true;
          }
        );
      }
    );
  });

  await testAsync('does not throw a secondary error when the error body is not valid JSON', async () => {
    await withMockedFetch(
      async () => ({ ok: false, status: 503, text: async () => '<html>upstream down</html>' }),
      async (isaacus) => {
        await assert.rejects(
          () => isaacus.extractAnswer('q', ['t']),
          (err) => {
            assert.match(err.message, /Isaacus 503/);
            assert.ok(!(err instanceof SyntaxError));
            return true;
          }
        );
      }
    );
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
