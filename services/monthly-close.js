const crypto = require('crypto');
const db = require('../db/monthly-close');
const { buildMonthlyClose } = require('../lib/monthly-close');
const { calculateModifiedDietz } = require('../lib/investment-performance');
function createMonthlyCloseService(database) {
  return async function createMonthlyClose(userId, month, options = {}) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Object.assign(new Error('Invalid close month.'), { code: 'INVALID_MONTH' });
    const monthParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit' }).formatToParts(options.now || new Date()).map((part) => [part.type, part.value]));
    const currentMonth = `${monthParts.year}-${monthParts.month}`;
    if (month >= currentMonth) throw Object.assign(new Error('Only completed months can be closed.'), { code: 'INCOMPLETE_MONTH' });
    const existing = await database.findMonthlyClose(userId, month); if (existing) return existing;
    const inputs = await database.loadMonthlyCloseInputs(userId, month);
    if ((inputs.snapshots || []).length < 2) throw Object.assign(new Error('At least two snapshots are required to close a month.'), { code: 'INSUFFICIENT_CLOSE_DATA' });
    const opening = inputs.snapshots[0]; const closing = inputs.snapshots.at(-1);
    inputs.investmentPerformance = calculateModifiedDietz({
      openingValue: opening.invest_balance, closingValue: closing.invest_balance,
      startDate: opening.snap_date, endDate: closing.snap_date, cashFlows: inputs.investmentCashFlows || [],
    });
    const payload = buildMonthlyClose(month, inputs);
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return database.storeMonthlyClose(userId, month, payload, hash);
  };
}
const createMonthlyClose = createMonthlyCloseService(db);
async function monthlyCloseHandler(req,res) {
  if (!req.session.userId) return res.status(401).json({error:'Not authenticated'});
  try { return res.status(201).json(await createMonthlyClose(req.session.userId, req.params.month)); }
  catch(error) { return res.status(error.code==='INVALID_MONTH'?400:['INCOMPLETE_MONTH','INSUFFICIENT_CLOSE_DATA'].includes(error.code)?409:500).json({error:error.message}); }
}
async function listMonthlyClosesHandler(req,res) { if(!req.session.userId)return res.status(401).json({error:'Not authenticated'}); try{return res.json({closes:await db.listMonthlyCloses(req.session.userId)});}catch(error){return res.status(500).json({error:'Could not load monthly closes.'});} }
module.exports = { createMonthlyCloseService, createMonthlyClose, monthlyCloseHandler, listMonthlyClosesHandler };
