'use strict';
// Deterministic tests for the PURE parts of the deep-research pipeline (PR 8):
// ticker planning + the Compute (quant aggregation) phase. The gather/write/
// verify phases do I/O and are not unit-tested here.

const assert = require('assert');
const { computeQuant, extractTickers, seedFromString, quantEvidence } = require('../services/research');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\ndeep research — plan + compute');

test('extractTickers pulls uppercase tickers, drops AU finance acronyms', () => {
  assert.deepStrictEqual(extractTickers('Should I buy AAPL or hold my ASX ETF via my SMSF?'), ['AAPL']);
  assert.deepStrictEqual(extractTickers('Compare NVDA and MSFT for CGT purposes'), ['NVDA', 'MSFT']);
  assert.deepStrictEqual(extractTickers('how is my super tracking'), []);
});

test('extractTickers caps at 5 and de-dupes', () => {
  const r = extractTickers('AAA BBB CCC DDD EEE FFF GGG AAA');
  assert.strictEqual(r.length, 5);
  assert.strictEqual(new Set(r).size, 5);
});

test('seedFromString is stable and unsigned 32-bit', () => {
  assert.strictEqual(seedFromString('AAPL'), seedFromString('AAPL'));
  assert.notStrictEqual(seedFromString('AAPL'), seedFromString('MSFT'));
  assert.ok(seedFromString('AAPL') >= 0);
});

test('computeQuant skips series shorter than 3 points', () => {
  const out = computeQuant({ AAA: [100, 101] }, [100, 101, 102, 103]);
  assert.strictEqual(out.hasData, false);
  assert.strictEqual(out.perSymbol.length, 0);
});

test('computeQuant produces per-symbol metrics and is deterministic', () => {
  const closes = [];
  for (let i = 0; i < 60; i++) closes.push(100 * Math.pow(1.001, i)); // steady climb
  const market = [];
  for (let i = 0; i < 60; i++) market.push(50 * Math.pow(1.0008, i));
  const a = computeQuant({ TEST: closes }, market);
  const b = computeQuant({ TEST: closes }, market);
  assert.strictEqual(a.hasData, true);
  assert.deepStrictEqual(a, b); // seeded Monte-Carlo → reproducible
  const s = a.perSymbol[0];
  assert.strictEqual(s.symbol, 'TEST');
  assert.strictEqual(s.dataPoints, 60);
  assert.ok(s.annualizedVol >= 0);
  assert.ok(s.maxDrawdown <= 0, 'drawdown is a non-positive fraction');
  assert.ok(typeof s.beta === 'number', 'beta computed when market series present');
  assert.ok(s.monteCarlo.terminal.p5 <= s.monteCarlo.terminal.p95);
});

test('computeQuant sets beta null when no market series is available', () => {
  const closes = [];
  for (let i = 0; i < 30; i++) closes.push(100 + i);
  const out = computeQuant({ TEST: closes }, []);
  assert.strictEqual(out.perSymbol[0].beta, null);
});

test('quantEvidence is empty when there is no data, else lists exact figures', () => {
  assert.strictEqual(quantEvidence({ hasData: false, perSymbol: [] }), '');
  const closes = [];
  for (let i = 0; i < 30; i++) closes.push(100 + i);
  const out = computeQuant({ TEST: closes }, []);
  const ev = quantEvidence(out);
  assert.ok(ev.includes('TEST'));
  assert.ok(/Monte Carlo/.test(ev));
  assert.ok(/authoritative/i.test(ev));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
