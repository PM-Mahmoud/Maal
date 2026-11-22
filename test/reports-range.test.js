'use strict';

// test/reports-range.test.js
// Deterministic tests for db/reports.js getTransactionsInRange — the
// date-ranged read behind GET /api/v1/reports/transactions (Reports page and
// the Transactions list). A fake pool evaluates the keyset query over
// in-memory rows, so no database is needed. Covers: newest rows kept when the
// cap is hit, oldest-first output, paging across pages, user_id scoping.

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

// In-memory transactions: user 1 has one row a day for 30 days (ids 1..30);
// user 2 has rows inside the same dates that must never leak.
const pad = (n) => String(n).padStart(2, '0');
const DATA = [];
for (let i = 1; i <= 30; i++) DATA.push({ user_id: 1, id: i, post_date: `2026-06-${pad(i)}`, description: `Row ${i}`, amount: -i });
// Two rows on the same day to exercise the (post_date, id) tie-break.
DATA.push({ user_id: 1, id: 31, post_date: '2026-06-30', description: 'Row 31', amount: -31 });
for (let i = 1; i <= 5; i++) DATA.push({ user_id: 2, id: 100 + i, post_date: `2026-06-${pad(i)}`, description: 'Other user', amount: -1 });

const queries = [];
const fakePool = {
  async query(sql, params) {
    queries.push({ sql, params });
    assert.ok(/WHERE t\.user_id = \$1/.test(sql), 'query must filter by user_id');
    assert.ok(/ORDER BY t\.post_date DESC, t\.id DESC/.test(sql), 'query must read newest first');
    const [userId, from, to, limit, bDate, bId] = params;
    const cmp = (a, b) => a.post_date.localeCompare(b.post_date) || a.id - b.id;
    const rows = DATA
      .filter((r) => r.user_id === userId && r.post_date >= from && r.post_date <= to)
      .filter((r) => bDate === undefined || cmp(r, { post_date: bDate, id: Number(bId) }) < 0)
      .sort((a, b) => -cmp(a, b))
      .slice(0, limit)
      .map(({ user_id, ...r }) => r); // eslint-disable-line no-unused-vars
    return { rows };
  },
};
const poolFile = require.resolve(path.join(__dirname, '..', 'db', 'pool'));
require.cache[poolFile] = { id: poolFile, filename: poolFile, loaded: true, exports: fakePool };
const { getTransactionsInRange } = require('../db/reports');

(async () => {
  console.log('\nreports-range');

  await test('returns the whole range oldest first when under the cap', async () => {
    const { rows, truncated } = await getTransactionsInRange(1, '2026-06-01', '2026-06-30');
    assert.strictEqual(truncated, false);
    assert.strictEqual(rows.length, 31);
    assert.deepStrictEqual(rows.slice(0, 2).map((r) => r.id), [1, 2]);
    assert.deepStrictEqual(rows.slice(-2).map((r) => r.id), [30, 31]);
  });

  await test('keeps the NEWEST rows when the cap is hit, still oldest first', async () => {
    const { rows, truncated } = await getTransactionsInRange(1, '2026-06-01', '2026-06-30', { pageSize: 4, maxRows: 10 });
    assert.strictEqual(truncated, true);
    assert.strictEqual(rows.length, 10);
    // Newest 10 by (post_date, id): ids 22..31, returned ascending.
    assert.deepStrictEqual(rows.map((r) => r.id), [22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
  });

  await test('pages with a keyset and no duplicates or gaps', async () => {
    queries.length = 0;
    const { rows, truncated } = await getTransactionsInRange(1, '2026-06-10', '2026-06-30', { pageSize: 5 });
    assert.strictEqual(truncated, false);
    assert.deepStrictEqual(rows.map((r) => r.id), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
    assert.ok(queries.length >= 5, 'expected several pages');
    assert.strictEqual(queries[0].params.length, 4); // first page has no keyset
    assert.deepStrictEqual(queries[1].params.slice(4), ['2026-06-27', 27]);
  });

  await test('exactly at the cap is not truncated', async () => {
    const { rows, truncated } = await getTransactionsInRange(1, '2026-06-01', '2026-06-30', { pageSize: 7, maxRows: 31 });
    assert.strictEqual(truncated, false);
    assert.strictEqual(rows.length, 31);
  });

  await test("never returns another user's rows", async () => {
    const { rows } = await getTransactionsInRange(1, '2026-06-01', '2026-06-05');
    assert.deepStrictEqual(rows.map((r) => r.id), [1, 2, 3, 4, 5]);
    const other = await getTransactionsInRange(2, '2026-06-01', '2026-06-30');
    assert.ok(other.rows.every((r) => r.id > 100));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
