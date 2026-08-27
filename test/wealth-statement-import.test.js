'use strict';

const assert = require('assert');
const { normalizeStatementImport, instrumentMatchKey } = require('../lib/wealth-statement-import');

const imported = normalizeStatementImport({
  kind: 'brokerage', accountName: 'Joint broker', institution: 'Broker AU', asOf: '2026-08-07',
  csv: 'Name,Ticker,ISIN,Units,Cost Basis,Market Value,Currency\n"Global, ETF",VGS,AU000000VGS1,12.345678,15000.25,18000.40,AUD\nCash option,,,1,500.00,500.00,AUD',
});
assert.equal(imported.account.accountType, 'brokerage');
assert.equal(imported.holdings.length, 2);
assert.equal(imported.holdings[0].instrument.name, 'Global, ETF');
assert.equal(imported.holdings[0].units, '12.345678');
assert.equal(imported.holdings[0].costBasisMinor, '1500025');
assert.equal(imported.holdings[0].valueMinor, '1800040');
assert.equal(instrumentMatchKey(imported.holdings[0].instrument), 'isin:AU000000VGS1');
assert.equal(instrumentMatchKey(imported.holdings[1].instrument), 'name:cash option:AUD');

const lots = normalizeStatementImport({
  kind: 'brokerage', accountName: 'Lots', asOf: '2026-08-07',
  csv: 'Name,ISIN,Units,Cost Basis,Market Value\nETF,AU0000000001,1.1,10,12\nETF,AU0000000001,2.2,20,24',
});
assert.equal(lots.holdings.length, 1, 'same-instrument lots consolidate before persistence');
assert.equal(lots.holdings[0].units, '3.3');
assert.equal(lots.holdings[0].costBasisMinor, '3000');
assert.equal(lots.holdings[0].valueMinor, '3600');

const superImport = normalizeStatementImport({
  kind: 'super', accountName: 'My Super', institution: 'Fund', asOf: '2026-08-07T04:00:00Z',
  csv: 'Fund,APIR,Units,Market Value\nBalanced option,ABC1234AU,100.1234567890,25000',
});
assert.equal(superImport.account.accountType, 'super');
assert.equal(superImport.holdings[0].instrument.instrumentType, 'super_option');
assert.equal(superImport.holdings[0].valueMinor, '2500000');
assert.equal(instrumentMatchKey(superImport.holdings[0].instrument), 'apir:ABC1234AU');

assert.throws(() => normalizeStatementImport({ kind: 'brokerage', asOf: '2026-08-07', csv: 'Name,Units,Market Value\nETF,1.12345678901,2' }), /at most 10 decimals/);
assert.throws(() => normalizeStatementImport({ kind: 'brokerage', asOf: '2026-08-07', csv: 'Name,Units,Market Value\nETF,1,12.345' }), /at most 2 decimals/);

console.log('✓ broker and super statements normalize into exact canonical import rows');
