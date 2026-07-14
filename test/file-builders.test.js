'use strict';
// Deterministic tests for lib/file-builders.js — CSV / SpreadsheetML generation
// and dataset shaping from the user's real data (PR 11).

const assert = require('assert');
const { toCsv, csvCell, toSpreadsheetXml, xmlEscape, buildDataset, isKnownDataset } = require('../lib/file-builders');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nfile builders');

test('csvCell quotes only when needed and doubles embedded quotes', () => {
  assert.strictEqual(csvCell('plain'), 'plain');
  assert.strictEqual(csvCell('a,b'), '"a,b"');
  assert.strictEqual(csvCell('she said "hi"'), '"she said ""hi"""');
  assert.strictEqual(csvCell('line\nbreak'), '"line\nbreak"');
  assert.strictEqual(csvCell(null), '');
  assert.strictEqual(csvCell(1234.5), '1234.5');
});

test('toCsv writes a header and CRLF-delimited rows', () => {
  const cols = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B, C' }];
  const csv = toCsv(cols, [{ a: '1', b: 'x' }, { a: '2', b: 'y,z' }]);
  assert.strictEqual(csv, 'A,"B, C"\r\n1,x\r\n2,"y,z"\r\n');
});

test('toCsv with no rows still emits the header', () => {
  assert.strictEqual(toCsv([{ key: 'a', label: 'A' }], []), 'A\r\n');
});

test('xmlEscape handles the five entities', () => {
  assert.strictEqual(xmlEscape(`<>&"'`), '&lt;&gt;&amp;&quot;&apos;');
});

test('toSpreadsheetXml is a well-formed Excel workbook with typed cells', () => {
  const xml = toSpreadsheetXml('Sheet', [{ key: 'name', label: 'Name' }, { key: 'v', label: 'Value' }],
    [{ name: 'Cash & co', v: 1000 }]);
  assert.ok(xml.startsWith('<?xml version="1.0"?>'));
  assert.ok(xml.includes('progid="Excel.Sheet"'));
  assert.ok(xml.includes('ss:Type="Number">1000<'));   // numbers typed as Number
  assert.ok(xml.includes('ss:Type="String">Cash &amp; co<')); // strings escaped
  assert.ok(xml.trim().endsWith('</Workbook>'));
});

test('toSpreadsheetXml truncates the sheet name to Excel\'s 31-char limit', () => {
  const xml = toSpreadsheetXml('x'.repeat(50), [{ key: 'a', label: 'A' }], []);
  const m = xml.match(/ss:Name="(x+)"/);
  assert.strictEqual(m[1].length, 31);
});

test('buildDataset(net_worth) shapes snapshot rows with numeric values', () => {
  const ds = buildDataset('net_worth', {
    snapshots: [{ snap_date: '2026-07-14T00:00:00Z', net_worth: 250000, assets_total: 290000, super_balance: 90000, invest_balance: 60000, cash_balance: 20000, debts_total: 40000 }],
  });
  assert.strictEqual(ds.sheet, 'Net worth');
  assert.strictEqual(ds.rows.length, 1);
  assert.strictEqual(ds.rows[0].date, '2026-07-14');
  assert.strictEqual(ds.rows[0].net_worth, 250000);
  assert.strictEqual(typeof ds.rows[0].net_worth, 'number');
});

test('buildDataset(goals) computes progress % and reads either column shape', () => {
  const ds = buildDataset('goals', {
    goals: [{ name: 'Emergency fund', category: 'emergency', current_amount: 3000, target_amount: 10000 }],
  });
  assert.strictEqual(ds.rows[0].progress, 30);
  assert.strictEqual(ds.rows[0].current, 3000);
});

test('buildDataset(balances) derives rows from the snapshot values', () => {
  const ds = buildDataset('balances', { snap: { cashBalance: 20000, investBalance: 60000, superBalance: 90000, assetsTotal: 290000, debtsTotal: 40000, netWorth: 250000 } });
  const nw = ds.rows.find((r) => r.category === 'Net worth');
  assert.strictEqual(nw.value, 250000);
});

test('buildDataset(transactions) is safe on empty/missing data', () => {
  const ds = buildDataset('transactions', {});
  assert.deepStrictEqual(ds.rows, []);
});

test('isKnownDataset gates the whitelist; unknown → null', () => {
  assert.strictEqual(isKnownDataset('net_worth'), true);
  assert.strictEqual(isKnownDataset('secrets'), false);
  assert.strictEqual(buildDataset('secrets', {}), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
