'use strict';
// Deterministic tests for lib/quick-score.js — the free /score calculator maths
// that we email to people. Also checks the server formula still matches the
// client calculator in views/score.ejs, so the emailed score equals the one
// shown on screen.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { computeQuickScore, sanitiseInputs, scoreBand } = require('../lib/quick-score');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nquick score (free /score calculator)');

const DEFAULTS = { age: 35, income: 95000, assets: 250000, debts: 80000, superBalance: 90000 };

test('default answers: worked example', () => {
  // savings: 170k / (95k × 35/5 = 665k) = 25.6 · debt: 1 − 80/250 = 68
  // super: 90k / 175k (ASFA @35) = 51.4 · trajectory: 250k / 285k = 87.7 · protection 55
  // total = 6.39 + 17 + 10.29 + 13.16 + 8.25 = 55.08 → 55
  const r = computeQuickScore(DEFAULTS);
  assert.strictEqual(r.total, 55);
  assert.strictEqual(r.band, 'Fair');
  assert.strictEqual(r.netWorth, 170000);
  assert.deepStrictEqual(r.pillars.map((p) => p.score), [26, 68, 51, 88, 55]);
  assert.deepStrictEqual(r.helping, [
    'Wealth Trajectory is growing faster than your income alone would suggest.',
    'Debt Management is well managed relative to what you own.',
  ]);
  assert.strictEqual(r.holdingBack.length, 2);
  assert.ok(r.holdingBack[0].startsWith('Savings & Net Worth'));
  assert.strictEqual(r.nextSteps.length, 3);
});

test('pillars are clamped to 0–100 and protection is a fixed estimate', () => {
  const rich = computeQuickScore({ age: 30, income: 100000, assets: 5e6, debts: 0, superBalance: 1e6 });
  rich.pillars.forEach((p) => assert.ok(p.score >= 0 && p.score <= 100, p.key));
  assert.strictEqual(rich.pillars.find((p) => p.key === 'protection').score, 55);
  const broke = computeQuickScore({ age: 40, income: 60000, assets: 10000, debts: 90000, superBalance: 0 });
  broke.pillars.forEach((p) => assert.ok(p.score >= 0 && p.score <= 100, p.key));
  assert.ok(broke.netWorth < 0);
});

test('garbage input is sanitised, never NaN', () => {
  const s = sanitiseInputs({ age: 'abc', income: -5, assets: 'NaN', debts: Infinity, superBalance: '1e20' });
  assert.deepStrictEqual(s, { age: 35, income: 0, assets: 0, debts: 0, superBalance: 1e9 });
  assert.strictEqual(sanitiseInputs({ age: 7 }).age, 16);
  assert.strictEqual(sanitiseInputs({ age: 150 }).age, 100);
  const r = computeQuickScore({ email: 'x', foo: 'bar' });
  assert.ok(Number.isInteger(r.total));
});

test('score bands', () => {
  assert.strictEqual(scoreBand(80), 'Excellent');
  assert.strictEqual(scoreBand(65), 'Good');
  assert.strictEqual(scoreBand(50), 'Fair');
  assert.strictEqual(scoreBand(35), 'Needs Work');
  assert.strictEqual(scoreBand(34), 'At Risk');
});

test('server formula matches the on-screen calculator (views/score.ejs)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'views', 'score.ejs'), 'utf8');
  const m = src.match(/function computeScore\(inp\) \{[\s\S]*?\n    \}\n/);
  assert.ok(m, 'could not find computeScore in views/score.ejs');
  const ctx = {};
  vm.runInNewContext(m[0] + '\nthis.computeScore = computeScore;', ctx);
  const cases = [
    DEFAULTS,
    { age: 25, income: 60000, assets: 20000, debts: 35000, superBalance: 30000 },
    { age: 52, income: 180000, assets: 1400000, debts: 400000, superBalance: 610000 },
    { age: 61, income: 0, assets: 0, debts: 0, superBalance: 0 },
    { age: 44, income: 120000, assets: 900000, debts: 650000, superBalance: 220000 },
  ];
  for (const c of cases) {
    const client = ctx.computeScore(Object.assign({}, c));
    const server = computeQuickScore(c);
    assert.strictEqual(server.total, client.total, 'total for ' + JSON.stringify(c));
    assert.deepStrictEqual(server.pillars.map((p) => p.score), Array.from(client.pillars, (p) => p.score), 'pillars for ' + JSON.stringify(c));
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
