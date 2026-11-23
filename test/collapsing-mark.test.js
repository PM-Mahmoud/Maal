'use strict';
// Deterministic tests for shared/collapsing-mark.mjs (the 404 page animation):
// the bricks spell the real Maal mark, the loop starts and ends assembled, the
// pile rests on the floor, and the reduced-motion frame keeps most of the M.

const assert = require('assert');

(async () => {
  const m = await import('../shared/collapsing-mark.mjs');
  let passed = 0;
  let failed = 0;
  const test = (name, fn) => {
    try { fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
  };
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

  // The 7×7 mark from client/src/components/maal/MaalMark.tsx.
  const MARK = new Set();
  for (let r = 0; r < 7; r++) { MARK.add(`0,${r}`); MARK.add(`6,${r}`); }
  ['1,1', '5,1', '2,2', '4,2', '3,3'].forEach((c) => MARK.add(c));

  test('bricks are exactly the cells of the Maal mark', () => {
    assert.strictEqual(m.BRICKS.length, 19);
    assert.deepStrictEqual(new Set(m.BRICKS.map((b) => b.id)), MARK);
  });

  test('assembled at the start and the end of the loop', () => {
    for (const b of m.BRICKS) {
      for (const t of [0, 0.5, m.LOOP - 0.01]) {
        const p = m.poseAt(b, t);
        near(p.x, b.col + 0.5, `${b.id} x at ${t}`);
        near(p.y, b.row + 0.5, `${b.id} y at ${t}`);
        near(p.rot, 0, `${b.id} rot at ${t}`);
      }
    }
  });

  test('a few bricks stay standing, most fall', () => {
    const standing = m.BRICKS.filter((b) => !b.falls);
    assert.ok(standing.length >= 6 && standing.length <= 10, `${standing.length} standing`);
    for (const b of standing) {
      for (let t = 0; t < m.LOOP; t += 0.1) assert.deepStrictEqual(m.poseAt(b, t), b.home);
    }
  });

  test('top bricks fall first', () => {
    const fallers = m.BRICKS.filter((b) => b.falls);
    for (let i = 1; i < fallers.length; i++) {
      assert.ok(m.fallWindow(fallers[i]).start > m.fallWindow(fallers[i - 1]).start);
      assert.ok(fallers[i].row >= fallers[i - 1].row - 1, 'roughly top-down');
    }
  });

  test('the pile rests on or above the floor, inside the view box', () => {
    const { x, w } = m.VIEWBOX;
    for (const b of m.BRICKS.filter((b) => b.falls)) {
      const p = m.poseAt(b, 4.5);
      assert.ok(m.isResting(4.5));
      assert.ok(p.y + 0.45 <= m.FLOOR + 1e-9, `${b.id} below floor`);
      assert.ok(p.x - 0.6 >= x && p.x + 0.6 <= x + w, `${b.id} outside view`);
      let a = ((p.rot % 90) + 90) % 90;
      if (a > 45) a -= 90;
      near(a, b.restAngle, `${b.id} lies at its rest angle`);
    }
  });

  test('falling bricks never go below the floor mid-flight', () => {
    for (const b of m.BRICKS.filter((b) => b.falls)) {
      for (let t = 0; t < m.LOOP; t += 0.01) {
        assert.ok(m.poseAt(b, t).y <= b.rest.y + 1e-9, `${b.id} at ${t}`);
      }
    }
  });

  test('poseAt is deterministic and wraps around the loop', () => {
    const b = m.BRICKS[0];
    assert.deepStrictEqual(m.poseAt(b, 2.1), m.poseAt(b, 2.1));
    assert.deepStrictEqual(m.poseAt(b, 2.1), m.poseAt(b, 2.1 + m.LOOP));
  });

  test('reduced-motion frame: most of the M standing, a few on the floor', () => {
    const moved = m.BRICKS.filter((b) => {
      const p = m.stillPose(b);
      return p.x !== b.home.x || p.y !== b.home.y;
    });
    assert.ok(moved.length >= 2 && moved.length <= 4, `${moved.length} moved`);
    for (const b of moved) assert.ok(m.stillPose(b).y + 0.45 <= m.FLOOR + 1e-9);
  });

  console.log(`\ncollapsing-mark: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
