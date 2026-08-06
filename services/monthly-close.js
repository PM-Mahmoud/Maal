const crypto = require('crypto');
const db = require('../db/monthly-close');
const { buildMonthlyClose } = require('../lib/monthly-close');
const { investmentPerformance } = require('./investment-performance');
function createMonthlyCloseService(database, performance = investmentPerformance) {
  return async function createMonthlyClose(userId, month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Object.assign(new Error('Invalid close month.'), { code: 'INVALID_MONTH' });
    const existing = await database.findMonthlyClose(userId, month); if (existing) return existing;
    const inputs = await database.loadMonthlyCloseInputs(userId, month);
    if (!inputs.investmentPerformance && performance) inputs.investmentPerformance = await performance(userId, 40).catch(() => null);
    const payload = buildMonthlyClose(month, inputs);
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return database.storeMonthlyClose(userId, month, payload, hash);
  };
}
const createMonthlyClose = createMonthlyCloseService(db);
async function monthlyCloseHandler(req,res) {
  if (!req.session.userId) return res.status(401).json({error:'Not authenticated'});
  try { return res.status(201).json(await createMonthlyClose(req.session.userId, req.params.month)); }
  catch(error) { return res.status(error.code==='INVALID_MONTH'?400:500).json({error:error.message}); }
}
async function listMonthlyClosesHandler(req,res) { if(!req.session.userId)return res.status(401).json({error:'Not authenticated'}); try{return res.json({closes:await db.listMonthlyCloses(req.session.userId)});}catch(error){return res.status(500).json({error:'Could not load monthly closes.'});} }
module.exports = { createMonthlyCloseService, createMonthlyClose, monthlyCloseHandler, listMonthlyClosesHandler };
