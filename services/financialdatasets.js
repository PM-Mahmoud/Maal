// services/financialdatasets.js — depth data provider for the research pipeline.
//
// REST API at api.financialdatasets.ai (env FINANCIAL_DATASETS_API_KEY). Source
// of US fundamentals + historical prices used by the Compute (quant) phase.
// US-centric — ASX/AU coverage stays with services/marketdata.js (Finnhub).
//
// Pluggable: every function returns []/null when the key is missing or a call
// fails, so the pipeline degrades to Finnhub + Exa (or model-only) gracefully
// and NEVER throws into the caller.

const BASE = 'https://api.financialdatasets.ai';
const TIMEOUT_MS = Number(process.env.FINANCIAL_DATASETS_TIMEOUT_MS) || 15000;

function key() {
  return (process.env.FINANCIAL_DATASETS_API_KEY || '').trim();
}
function hasFinancialDatasets() {
  return !!key();
}

async function fdGet(path) {
  if (!hasFinancialDatasets()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      signal: controller.signal,
      headers: { 'X-API-KEY': key(), Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('financialdatasets ' + res.status);
    return await res.json();
  } catch (e) {
    console.error('financialdatasets: request failed:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Historical daily prices → [{ date, close, open, high, low, volume }] oldest→newest.
// `days` controls the look-back window (default ~1y of trading days).
async function getPrices(ticker, { days = 400 } = {}) {
  if (!ticker) return [];
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const q = `/prices/?ticker=${encodeURIComponent(ticker)}&interval=day&interval_multiplier=1`
    + `&start_date=${ymd(start)}&end_date=${ymd(end)}`;
  const data = await fdGet(q);
  const rows = data && Array.isArray(data.prices) ? data.prices : [];
  return rows
    .map((p) => ({
      date: p.time ? String(p.time).slice(0, 10) : null,
      close: Number(p.close) || 0,
      open: Number(p.open) || 0,
      high: Number(p.high) || 0,
      low: Number(p.low) || 0,
      volume: Number(p.volume) || 0,
    }))
    .filter((p) => p.close > 0);
}

// Convenience: just the close series (oldest→newest) for the quant lib.
async function getCloseSeries(ticker, opts) {
  return (await getPrices(ticker, opts)).map((p) => p.close);
}

// Company fundamentals snapshot → object or null.
async function getCompanyFacts(ticker) {
  if (!ticker) return null;
  const data = await fdGet(`/company/facts/?ticker=${encodeURIComponent(ticker)}`);
  return (data && data.company_facts) || null;
}

// Income statements → array (most recent first) or [].
async function getIncomeStatements(ticker, { period = 'annual', limit = 4 } = {}) {
  if (!ticker) return [];
  const data = await fdGet(`/financials/income-statements/?ticker=${encodeURIComponent(ticker)}&period=${period}&limit=${limit}`);
  return (data && Array.isArray(data.income_statements)) ? data.income_statements : [];
}

module.exports = {
  hasFinancialDatasets,
  getPrices,
  getCloseSeries,
  getCompanyFacts,
  getIncomeStatements,
};
