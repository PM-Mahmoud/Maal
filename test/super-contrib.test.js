'use strict';
// Deterministic tests for shared/super-contrib.mjs — the concessional-cap clamp
// behind the Super Optimiser projection.
//
// Regression origin: the projection used `sg + Math.min(extra, CAP - sg)`. When
// SG alone exceeded the cap, `CAP - sg` was negative, so the "with extra" curve
// fell BELOW the "SG only" baseline — extra contributions appeared to destroy
// balance for high earners. Headroom must floor at zero.
//
// The module is ESM (Vite bundles it directly); loaded here with dynamic
// import() so this stays a CommonJS test on the Node 20 used by CI.

const assert = require('assert');

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

const CAP = 32500; // FY2026-27 concessional cap

(async () => {
  const { remainingConcessionalCap, cappedTotalContribution } =
    await import('../shared/super-contrib.mjs');

  console.log('\nremainingConcessionalCap');

  test('headroom is cap minus SG when SG is below the cap', () => {
    assert.strictEqual(remainingConcessionalCap(12000, CAP), 20500);
  });

  test('headroom is exactly zero when SG equals the cap', () => {
    assert.strictEqual(remainingConcessionalCap(CAP, CAP), 0);
  });

  test('headroom floors at zero when SG exceeds the cap (never negative)', () => {
    assert.strictEqual(remainingConcessionalCap(40000, CAP), 0);
  });

  console.log('\ncappedTotalContribution');

  test('extra within headroom is added in full', () => {
    // SG 12,000 + extra 10,000 = 22,000, still under the 32,500 cap.
    assert.strictEqual(cappedTotalContribution(12000, 10000, CAP), 22000);
  });

  test('extra beyond headroom is trimmed to the cap', () => {
    // SG 12,000, headroom 20,500, asking for 30,000 → total lands on the cap.
    assert.strictEqual(cappedTotalContribution(12000, 30000, CAP), CAP);
  });

  test('REGRESSION: SG above the cap never drops below the SG-only baseline', () => {
    const sg = 40000; // high earner: 12% SG on ~$333k already exceeds the cap
    const total = cappedTotalContribution(sg, 10000, CAP);
    assert.strictEqual(total, sg, 'total equals SG, not the cap');
    assert.ok(total >= sg, 'with-extra total is never less than SG alone');
  });

  test('zero extra always equals the SG-only baseline, at any income', () => {
    for (const sg of [0, 12000, CAP, 40000, 120000]) {
      assert.strictEqual(cappedTotalContribution(sg, 0, CAP), sg, `sg=${sg}`);
    }
  });

  test('negative extra is treated as zero, never subtracts from SG', () => {
    assert.strictEqual(cappedTotalContribution(12000, -5000, CAP), 12000);
  });

  test('missing/NaN inputs degrade to zero rather than producing NaN', () => {
    assert.strictEqual(cappedTotalContribution(undefined, undefined, CAP), 0);
    assert.strictEqual(cappedTotalContribution(12000, null, CAP), 12000);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
