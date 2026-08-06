const crypto = require('crypto');
const db = require('../db/financial-export');
const { serializeFinancialExport } = require('../lib/financial-export');
function createFinancialExportService(database) {
  return async function financialExport(userId, format, options = {}) {
    const bundle = { exported_at: (options.now || new Date()).toISOString(), schema_version: 1, data: await database.loadFinancialExport(userId) };
    const content = serializeFinancialExport(bundle, format);
    return {
      filename: `maal-financial-export-${bundle.exported_at.slice(0,10)}.${format}`,
      mime: format === 'json' ? 'application/json' : 'text/csv',
      base64: Buffer.from(content, 'utf8').toString('base64'),
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
  };
}
const financialExport = createFinancialExportService(db);
async function financialExportHandler(req,res) {
  if(!req.session.userId)return res.status(401).json({error:'Not authenticated'});
  const format=String(req.body?.format||'json').toLowerCase();
  if(!['json','csv'].includes(format))return res.status(400).json({error:'Format must be json or csv.'});
  try{return res.json(await financialExport(req.session.userId,format));}catch(error){console.error('/api/v1/financial-export:',error.message);return res.status(500).json({error:'Could not export financial data.'});}
}
module.exports = { createFinancialExportService, financialExport, financialExportHandler };
