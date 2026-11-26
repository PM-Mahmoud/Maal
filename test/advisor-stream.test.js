'use strict';
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const gateway = require('../services/gateway');
const users = require('../db/users');
const access = require('../services/access');
const researchTool = require('../services/advisor-research');
const grounding = require('../services/grounding');
const market = require('../services/marketdata');
const threadValidation = require('../lib/advisor-threads');
const usage = require('../db/usage');
const memory = require('../services/advisor-memory');
const memoryDb = require('../db/advisor-memory');

let plan = 'member';
let memoryStarts = 0;
users.findUserById = async id => ({ id });
access.forUser = async () => ({ plan });
let researchOverLimit = false;
let featureCalls = [];
usage.incrementIfUnder = async (id, feature) => { featureCalls.push([id, feature]); return feature === 'research_runs' && researchOverLimit ? null : 1; };
memory.shouldMerge = () => { memoryStarts++; return false; };

require('../db/profiles').getProfileByUserId = async () => ({});
require('../db/assets').getAssetSummary = async () => ({});
require('../db/assets').mergeAssetSummaryIntoProfile = profile => profile;
require('../db/vault').getReadableDocs = async () => [];
require('../db/transactions').getCashFlowTransactions = async () => [];
require('../db/snapshots').getSnapshots = async () => [];
require('../db/goals').listGoals = async () => [];
require('../services/isaacus').hasIsaacus = () => false;
require('../services/embeddings').hasEmbeddings = () => false;
memoryDb.getMemory = async () => ({ content: '', last_merged_at: null });
memoryDb.getCustomInstructions = async () => '';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
app.use('/api', require('../routes/api'));

let server;
let url;
before(async () => {
  process.env.GATEWAY_BASE_URL = 'https://model.example.invalid';
  process.env.GATEWAY_API_KEY = 'fixture';
  process.env.GATEWAY_MODEL_REASONER = 'reasoner';
  process.env.GATEWAY_MODEL_VERIFIER = 'verifier';
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve).once('error', reject);
  });
  url = `http://127.0.0.1:${server.address().port}/api/v1/advisor/stream`;
});
after(() => { gateway._setFetchForTests(); server?.closeAllConnections(); server?.close(); });

const ask = (signal, message = 'Explain super in plain language.', history = []) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, history }),
  signal,
});
const completion = (text) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
function packets(body) {
  return body.trim().split('\n\n').filter(s => s.startsWith('event:')).map(block => {
    const [event, data] = block.split('\n');
    return [event.slice(7), JSON.parse(data.slice(6))];
  });
}

test('streams stage boundaries, then a single assistant reply after the verifier passes', async () => {
  const calls = [];
  gateway._setFetchForTests(async (_url, opts) => {
    const { model } = JSON.parse(opts.body);
    calls.push(model);
    return completion(model === 'reasoner' ? 'Verified education.' : '{"pass":true}');
  });
  const res = await ask();
  assert.match(res.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  const events = packets(await res.text());
  assert.deepEqual(calls, ['reasoner', 'verifier']);
  const expected = ['retrieving_data', 'checking_constants', 'drafting', 'verifying'].flatMap((stage) =>
    ['start', 'end'].map((phase) => ['step', { stage, phase }]));
  assert.deepEqual(events, [...expected,
    ['final', { reply: 'Verified education.', widgets: [], followUps: [], citations: [] }],
    ['done', {}],
  ]);
});

test('a revision emits its own step and never exposes the original draft', async () => {
  let drafts = 0;
  gateway._setFetchForTests(async (_url, opts) => {
    if (JSON.parse(opts.body).model === 'verifier') return completion('{"pass":false,"issues":["Wrong threshold"]}');
    return completion(++drafts === 1 ? 'Rejected draft content' : 'The corrected answer.');
  });
  const body = await (await ask()).text();
  assert.doesNotMatch(body, /Rejected draft content|Wrong threshold/);
  const events = packets(body);
  assert.deepEqual(events.slice(-4), [
    ['step', { stage: 'revising', phase: 'start' }],
    ['step', { stage: 'revising', phase: 'end' }],
    ['final', { reply: 'The corrected answer.', widgets: [], followUps: [], citations: [] }],
    ['done', {}],
  ]);
});

test('usage denial remains a 402 JSON response before any provider work', async () => {
  plan = 'free';
  let called = false;
  gateway._setFetchForTests(async () => { called = true; return completion(''); });
  try {
    const res = await ask();
    assert.equal(res.status, 402);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.equal((await res.json()).code, 'usage_limit');
    assert.equal(called, false);
  } finally { plan = 'member'; }
});

test('an unusable verifier response emits a safe error and no final reply', async () => {
  const started = memoryStarts;
  gateway._setFetchForTests(async (_url, opts) =>
    completion(JSON.parse(opts.body).model === 'reasoner' ? 'PRIVATE DRAFT' : 'Invalid verifier result'));
  const body = await (await ask()).text();
  assert.doesNotMatch(body, /PRIVATE DRAFT|Invalid verifier result|event: final/);
  assert.equal(packets(body).at(-1)[0], 'error');
  assert.equal(memoryStarts, started);
});

test('disconnect aborts the model request and skips answer or memory persistence', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const started = memoryStarts;
  let onFetchStarted, onFetchAborted;
  const fetchStarted = new Promise(resolve => { onFetchStarted = resolve; });
  const fetchAborted = new Promise(resolve => { onFetchAborted = resolve; });
  gateway._setFetchForTests((_url, { signal }) => {
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        onFetchAborted();
        reject(signal.reason);
      }, { once: true });
      onFetchStarted();
    });
  });
  const res = await ask(controller.signal);
  const reading = res.text();
  await fetchStarted;
  controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  await fetchAborted;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(memoryStarts, started);
});

test('only explicit research requests map to the research tool and context stays in the current chat', () => {
  assert.equal(researchTool.researchQuestion('Why is research useful?', []), null);
  assert.equal(researchTool.researchQuestion("Don't research this.", []), null);
  assert.equal(researchTool.researchQuestion('/research: how do dividends work?', []), 'how do dividends work?');
  assert.equal(researchTool.researchQuestion('Could you research this for me?', [
    { role: 'user', content: 'How do bond ETFs work?' }, { role: 'assistant', content: 'Untrusted prior assistant text' },
  ]), 'How do bond ETFs work?');
  assert.equal(researchTool.researchQuestion('Research this.', []), '');
});

test('a research quota denial uses the existing upgrade response before a stream or model call', async () => {
  researchOverLimit = true;
  featureCalls = [];
  let requested = false;
  gateway._setFetchForTests(async () => { requested = true; return completion(''); });
  try {
    const res = await ask(undefined, 'Research Australian bonds');
    assert.equal(res.status, 402);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    const result = await res.json();
    assert.equal(result.code, 'usage_limit');
    assert.equal(result.feature, 'research_runs');
    assert.equal(requested, false);
    assert.deepEqual(featureCalls, [[7, 'research_runs']]);
  } finally { researchOverLimit = false; }
});

test('the in-thread report preserves only safe, grounded citations and emits a verified final', async () => {
  featureCalls = [];
  const original = { enabled: grounding.hasGrounding, web: grounding.searchWeb, news: grounding.searchNews, market: market.hasMarketData };
  grounding.hasGrounding = () => true;
  grounding.searchWeb = async question => {
    assert.equal(question, 'Australian government bonds');
    return [
      { title: 'Primary source', snippet: 'Grounding fixture.', url: 'https://source.example.test/bonds' },
      { title: 'Invalid link', snippet: 'Excluded link.', url: 'about:blank' },
    ];
  };
  grounding.searchNews = async () => [];
  market.hasMarketData = () => false;
  const modelCalls = [];
  gateway._setFetchForTests(async (_url, options) => {
    const request = JSON.parse(options.body);
    modelCalls.push(request.model);
    if (request.model === 'verifier') {
      assert.match(request.messages[1].content, /Grounding fixture/);
      return completion('{"pass":true}');
    }
    return completion('## Bond research\nAn educational report.');
  });
  try {
    const res = await ask(undefined, 'Research Australian government bonds');
    assert.equal(res.status, 200);
    const events = packets(await res.text());
    const [name, final] = events.at(-2);
    const citations = [{ label: 'Primary source', url: 'https://source.example.test/bonds' }];
    assert.equal(name, 'final');
    assert.equal(final.reply, '## Bond research\nAn educational report.');
    assert.deepEqual(final.citations, citations);
    assert.deepEqual(threadValidation.sanitizeMeta({ citations }).citations, citations);
    assert.deepEqual(threadValidation.sanitizeMeta({ citations: [{ label: 'Invalid link', url: 'about:blank' }] }).citations, [{ label: 'Invalid link' }]);
    assert.deepEqual(modelCalls, ['reasoner', 'verifier']);
    assert.deepEqual(featureCalls, [[7, 'research_runs']]);
  } finally {
    grounding.hasGrounding = original.enabled;
    grounding.searchWeb = original.web;
    grounding.searchNews = original.news;
    market.hasMarketData = original.market;
  }
});
