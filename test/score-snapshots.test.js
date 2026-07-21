'use strict';

// test/score-snapshots.test.js
// Deterministic tests for db/score-snapshots.js shapeScoreSnapshotHistory() —
// the pure function behind GET /api/v1/score's daily history series (React
// dashboard score chart). No DB needed; per CLAUDE.md's hard rule, score-
// related data shaping is tested.

const assert = require('assert');
const { shapeScoreSnapshotHistory } = require('../db/score-snapshots');

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

console.log('\nshapeScoreSnapshotHistory');

test('empty / nullish input returns []', () => {
  assert.deepStrictEqual(shapeScoreSnapshotHistory([]), []);
  assert.deepStrictEqual(shapeScoreSnapshotHistory(null), []);
  assert.deepStrictEqual(shapeScoreSnapshotHistory(undefined), []);
});

test('maps rows to { value, at }, preserving DB order (oldest first)', () => {
  const rows = [
    { snap_date: '2026-07-01', score: 60 },
    { snap_date: '2026-07-02', score: 62 },
    { snap_date: '2026-07-03', score: 65 },
  ];
  assert.deepStrictEqual(shapeScoreSnapshotHistory(rows), [
    { value: 60, at: '2026-07-01' },
    { value: 62, at: '2026-07-02' },
    { value: 65, at: '2026-07-03' },
  ]);
});

test('coerces BIGINT/string scores to numbers', () => {
  const rows = [{ snap_date: '2026-07-01', score: '74' }];
  assert.deepStrictEqual(shapeScoreSnapshotHistory(rows), [{ value: 74, at: '2026-07-01' }]);
});

test('drops rows with a null score', () => {
  const rows = [
    { snap_date: '2026-07-01', score: 50 },
    { snap_date: '2026-07-02', score: null },
    { snap_date: '2026-07-03', score: 55 },
  ];
  assert.deepStrictEqual(shapeScoreSnapshotHistory(rows), [
    { value: 50, at: '2026-07-01' },
    { value: 55, at: '2026-07-03' },
  ]);
});

test('drops rows whose score is non-numeric junk', () => {
  const rows = [
    { snap_date: '2026-07-01', score: 'abc' },
    { snap_date: '2026-07-02', score: 40 },
  ];
  assert.deepStrictEqual(shapeScoreSnapshotHistory(rows), [{ value: 40, at: '2026-07-02' }]);
});

test('a zero score is kept (0 is a valid score, not missing data)', () => {
  const rows = [{ snap_date: '2026-07-01', score: 0 }];
  assert.deepStrictEqual(shapeScoreSnapshotHistory(rows), [{ value: 0, at: '2026-07-01' }]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
