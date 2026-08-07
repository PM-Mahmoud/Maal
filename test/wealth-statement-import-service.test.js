'use strict';

const assert = require('assert');
const { createStatementImportService, createStatementImportHandler } = require('../services/wealth-statement-import');

(async () => {
  let persisted;
  const service = createStatementImportService({
    persistStatementImport: async (...args) => { persisted = args; return { accountId: 9, holdings: 1 }; },
  });
  const result = await service(42, {
    statement_id: 'broker-2026-08', kind: 'brokerage', account_name: 'Broker', as_of: '2026-08-07',
    csv: 'Name,ISIN,Units,Market Value\nETF,AU0000000001,10,1000',
  });
  assert.deepStrictEqual(result, { accountId: 9, holdings: 1 });
  assert.equal(persisted[0], 42);
  assert.equal(persisted[1], 'broker-2026-08');
  assert.equal(persisted[2].holdings[0].valueMinor, '100000');
  assert.match(persisted[3].sourceHash, /^[a-f0-9]{64}$/);
  assert.match(persisted[3].rawCsv, /^Name,ISIN/);

  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await createStatementImportHandler(service)({ session: { userId: 42 }, body: {
    kind: 'brokerage', as_of: 'bad', csv: 'Name,Units,Market Value\nETF,1,1',
  } }, response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /valid date/);

  console.log('✓ statement import service validates then persists tenant-scoped canonical rows');
})().catch((error) => { console.error(error); process.exit(1); });
