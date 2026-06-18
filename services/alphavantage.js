'use strict';
// Alpha Vantage REST adapter — secondary market data source
// Primary: Finnhub (real-time quotes, news). Alpha Vantage fills gaps:
//   - Historical OHLCV (daily, 20+ years)
//   - Fundamental data (P/E, EPS, revenue, balance sheet overview)
//   - Economic indicators (CPI, Fed Funds rate, unemployment)
// Free tier: 25 requests/day, 500/month. Set ALPHA_VANTAGE_KEY env var.

const BASE = 'https://www.alphavantage.co/query';
const KEY  = process.env.ALPHA_VANTAGE_KEY || '';

const _cache = new Map();
const TTL_SHORT = 15 * 60 * 1000;  // 15 min — fundamentals
const TTL_LONG  = 4 * 60 * 60 * 1000; // 4 hr — economic indicators

function cacheGet(k) {
  const hit = _cache.get(k);
  if (hit && Date.now() - hit.ts < hit.ttl) return hit.val;
  return null;
}
function cacheSet(k, val, ttl) {
  _cache.set(k, { val, ts: Date.now(), ttl });
}

async function avFetch(params) {
  if (!KEY) throw new Error('ALPHA_VANTAGE_KEY not configured');
  const qs = new URLSearchParams({ ...params, apikey: KEY }).toString();
  const r = await fetch(`${BASE}?${qs}`);
  if (!r.ok) throw new Error(`Alpha Vantage HTTP ${r.status}`);
  const data = await r.json();
  if (data['Note']) throw new Error('Alpha Vantage rate limit hit');
  if (data['Error Message']) throw new Error(`Alpha Vantage: ${data['Error Message']}`);
  return data;
}

/**
 * Company overview — P/E, EPS, market cap, dividend yield, 52-week range
 */
async function getCompanyOverview(symbol) {
  const key = `overview:${symbol}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await avFetch({ function: 'OVERVIEW', symbol });
  const result = {
    symbol: data.Symbol,
    name: data.Name,
    exchange: data.Exchange,
    sector: data.Sector,
    industry: data.Industry,
    marketCap: data.MarketCapitalization ? Number(data.MarketCapitalization) : null,
    pe: data.PERatio && data.PERatio !== 'None' ? Number(data.PERatio) : null,
    eps: data.EPS && data.EPS !== 'None' ? Number(data.EPS) : null,
    dividendYield: data.DividendYield && data.DividendYield !== 'None' ? (Number(data.DividendYield) * 100).toFixed(2) + '%' : null,
    week52High: data['52WeekHigh'] ? Number(data['52WeekHigh']) : null,
    week52Low: data['52WeekLow'] ? Number(data['52WeekLow']) : null,
    beta: data.Beta && data.Beta !== 'None' ? Number(data.Beta) : null,
    analystTarget: data.AnalystTargetPrice && data.AnalystTargetPrice !== 'None' ? Number(data.AnalystTargetPrice) : null,
    description: data.Description || null,
  };
  cacheSet(key, result, TTL_SHORT);
  return result;
}

/**
 * Daily price history — returns last `outputsize` trading days
 * outputsize: 'compact' (100 days) or 'full' (20+ years)
 */
async function getDailyHistory(symbol, outputsize = 'compact') {
  const key = `daily:${symbol}:${outputsize}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await avFetch({ function: 'TIME_SERIES_DAILY', symbol, outputsize });
  const series = data['Time Series (Daily)'] || {};
  const result = Object.entries(series).map(([date, v]) => ({
    date,
    open: Number(v['1. open']),
    high: Number(v['2. high']),
    low: Number(v['3. low']),
    close: Number(v['4. close']),
    volume: Number(v['5. volume']),
  })).sort((a, b) => a.date.localeCompare(b.date));

  cacheSet(key, result, TTL_SHORT);
  return result;
}

/**
 * Earnings history — quarterly EPS actuals vs estimates
 */
async function getEarnings(symbol) {
  const key = `earnings:${symbol}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await avFetch({ function: 'EARNINGS', symbol });
  const quarterly = (data.quarterlyEarnings || []).slice(0, 8).map(q => ({
    quarter: q.fiscalDateEnding,
    reportedEPS: q.reportedEPS !== 'None' ? Number(q.reportedEPS) : null,
    estimatedEPS: q.estimatedEPS !== 'None' ? Number(q.estimatedEPS) : null,
    surprise: q.surprisePercentage !== 'None' ? Number(q.surprisePercentage) : null,
  }));
  cacheSet(key, quarterly, TTL_SHORT);
  return quarterly;
}

/**
 * Economic indicator — US Fed Funds rate (monthly, last 12 months)
 */
async function getFedFundsRate() {
  const key = 'econ:fedfunds';
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await avFetch({ function: 'FEDERAL_FUNDS_RATE', interval: 'monthly' });
  const result = (data.data || []).slice(0, 12).map(d => ({ date: d.date, rate: Number(d.value) }));
  cacheSet(key, result, TTL_LONG);
  return result;
}

/**
 * Format company overview for prompt injection
 */
function formatOverviewForPrompt(overview) {
  if (!overview) return '';
  const parts = [
    `${overview.name} (${overview.symbol}, ${overview.exchange})`,
    overview.sector && `Sector: ${overview.sector}`,
    overview.pe && `P/E: ${overview.pe}`,
    overview.eps && `EPS: $${overview.eps}`,
    overview.dividendYield && `Div yield: ${overview.dividendYield}`,
    overview.week52High && `52-wk range: $${overview.week52Low}–$${overview.week52High}`,
    overview.beta && `Beta: ${overview.beta}`,
    overview.analystTarget && `Analyst target: $${overview.analystTarget}`,
  ].filter(Boolean);
  return parts.join(' | ');
}

function hasAlphaVantage() {
  return Boolean(KEY);
}

module.exports = {
  hasAlphaVantage,
  getCompanyOverview,
  getDailyHistory,
  getEarnings,
  getFedFundsRate,
  formatOverviewForPrompt,
};
