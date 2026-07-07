'use strict';

// test/score-history.test.js
// Deterministic tests for db/scores.js shapeScoreHistory() — the pure function
// behind GET /api/v1/score's history series (React dashboard score chart).
// No DB needed; per CLAUDE.md's hard rule, score-related data shaping is tested.

const assert = require('assert');
const { shapeScoreHistory } = require('../db/scores');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\nshapeScoreHistory');

test('empty / nullish input returns []', () => {
  assert.deepStrictEqual(shapeScoreHistory([]), []);
  assert.deepStrictEqual(shapeScoreHistory(null), []);
  assert.deepStrictEqual(shapeScoreHistory(undefined), []);
});

test('filters to the requested score_type only', () => {
  const rows = [
    { score_type: 'maal_score', score_value: 70, calculated_at: '2026-02-01' },
    { score_type: 'financial_health', score_value: 55, calculated_at: '2026-02-01' },
  ];
  const out = shapeScoreHistory(rows, 'maal_score');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].value, 70);
});

test('reverses DESC rows into oldest-first chronological order', () => {
  // getScoresByUserId returns newest-first (ORDER BY calculated_at DESC)
  const rows = [
    { score_type: 'maal_score', score_value: 82, calculated_at: '2026-03-01' },
    { score_type: 'maal_score', score_value: 75, calculated_at: '2026-02-01' },
    { score_type: 'maal_score', score_value: 60, calculated_at: '2026-01-01' },
  ];
  const out = shapeScoreHistory(rows);
  assert.deepStrictEqual(out.map((p) => p.value), [60, 75, 82]);
  assert.strictEqual(out[0].at, '2026-01-01');
});

test('coerces string score_value (Postgres numerics come back as strings) to number', () => {
  const rows = [{ score_type: 'maal_score', score_value: '68', calculated_at: '2026-01-01' }];
  const out = shapeScoreHistory(rows);
  assert.strictEqual(out[0].value, 68);
  assert.strictEqual(typeof out[0].value, 'number');
});

test('drops rows with null/non-finite score_value', () => {
  const rows = [
    { score_type: 'maal_score', score_value: null, calculated_at: '2026-01-01' },
    { score_type: 'maal_score', score_value: 'n/a', calculated_at: '2026-02-01' },
    { score_type: 'maal_score', score_value: 90, calculated_at: '2026-03-01' },
  ];
  const out = shapeScoreHistory(rows);
  assert.deepStrictEqual(out.map((p) => p.value), [90]);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
