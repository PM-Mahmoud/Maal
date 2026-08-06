const assert = require('assert');
const { serializeFinancialExport } = require('../lib/financial-export');
const { createFinancialExportService } = require('../services/financial-export');
const bundle = { exported_at: '2026-08-07T00:00:00.000Z', schema_version: 1, data: { cash_accounts: [{ id: 1, label: 'Main, saver', balance: '12.34' }], debts: [] } };
const json = serializeFinancialExport(bundle, 'json');
assert.deepStrictEqual(JSON.parse(json).data.cash_accounts[0].label, 'Main, saver');
const csv = serializeFinancialExport(bundle, 'csv');
assert.match(csv, /table,row_index,record_json/);
assert.match(csv, /cash_accounts,0,/);
assert.match(csv, /Main, saver/);
assert.throws(() => serializeFinancialExport(bundle, 'pdf'), /Unsupported export format/);
(async () => {
  let scoped;
  const exportData = createFinancialExportService({ loadFinancialExport: async (userId) => { scoped = userId; return { debts: [] }; } });
  const file = await exportData(44, 'json', { now: new Date('2026-08-07T00:00:00Z') });
  assert.equal(scoped, 44); assert.equal(file.sha256.length, 64); assert.match(file.filename, /2026-08-07/);
  console.log('✓ complete financial bundles serialize losslessly as JSON and CSV');
})().catch((error) => { console.error(error); process.exit(1); });
