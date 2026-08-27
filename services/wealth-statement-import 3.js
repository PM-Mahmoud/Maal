'use strict';

const crypto = require('crypto');
const database = require('../db/wealth-statement-import');
const { normalizeStatementImport } = require('../lib/wealth-statement-import');

function createStatementImportService(db = database) {
  return async function importStatement(userId, input) {
    const statementId = input.statement_id || crypto.createHash('sha256').update(String(input.csv || '')).digest('hex');
    const normalized = normalizeStatementImport({
      kind: input.kind, csv: input.csv, accountName: input.account_name,
      institution: input.institution, asOf: input.as_of,
      fxSource: input.fx_source, fxRate: input.fx_rate,
    });
    const sourceHash = crypto.createHash('sha256').update(String(input.csv || '')).digest('hex');
    return db.persistStatementImport(userId, statementId, normalized, { sourceHash, rawCsv: String(input.csv || '') });
  };
}

function createStatementImportHandler(importStatement) {
  return async function statementImportHandler(req, res) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const result = await importStatement(req.session.userId, req.body || {});
      return res.status(201).json({ ok: true, ...result });
    } catch (error) {
      const validation = /Statement|Row \d+|Account name|Currency|asOf|stable statementId|non-AUD/.test(error.message);
      if (!validation) console.error('wealth statement import error:', error.message);
      return res.status(validation ? 400 : 500).json({ error: validation ? error.message : 'Could not import statement' });
    }
  };
}

const importStatement = createStatementImportService();
module.exports = { createStatementImportService, createStatementImportHandler, importStatement, statementImportHandler: createStatementImportHandler(importStatement) };
