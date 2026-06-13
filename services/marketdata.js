// services/marketdata.js
// Real-time market data via Finnhub (https://finnhub.io). Pluggable: every
// call degrades to null/[] when FINNHUB_API_KEY isn't set, so the app keeps
// working with honest placeholders until the key is added on Render.
//
// SETUP (~1 min): sign up free at finnhub.io → copy the API key →
// Render: Environment → FINNHUB_API_KEY = <key>. Free tier ~60 calls/min.

const BASE = 'https://finnhub.io/api/v1';

function apiKey() {
  return (process.env.FINNHUB_API_KEY || '').trim();
}
function hasMarketData() {
  return !!apiKey();
}

// Tiny in-memory cache so repeated dashboard loads don't burn the rate limit.
const cache = new Map(); // key -> { exp, value }
function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.exp) return hit.value;
  const p = Promise.resolve()
    .then(fn)
    .catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { exp: Date.now() + ttlMs, value: p });
  return p;
}

async function get(path) {
  if (!hasMarketData()) return null;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}token=${encodeURIComponent(apiKey())}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Finnhub ${res.status} on ${path.split('?')[0]}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Real-time quote for one symbol → { symbol, price, change, percent } or null
async function getQuote(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  return cached(`quote:${sym}`, 60 * 1000, async () => {
    const q = await get(`/quote?symbol=${encodeURIComponent(sym)}`);
    if (!q || typeof q.c !== 'number' || q.c === 0) return null;
    return { symbol: sym, price: q.c, change: q.d, percent: q.dp, high: q.h, low: q.l, prevClose: q.pc };
  });
}

// Quotes for a list of symbols (sequential to respect the free rate limit)
async function getQuotes(symbols) {
  const out = [];
  for (const s of symbols || []) {
    try { const q = await getQuote(s); if (q) out.push(q); } catch (e) { /* skip one */ }
  }
  return out;
}

// Company-specific news (last ~7 days) → [{ headline, summary, source, url, datetime }]
async function getCompanyNews(symbol, days = 7) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return [];
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return cached(`cnews:${sym}:${days}`, 10 * 60 * 1000, async () => {
    const arr = await get(`/company-news?symbol=${encodeURIComponent(sym)}&from=${fmt(from)}&to=${fmt(to)}`);
    return Array.isArray(arr) ? arr.slice(0, 12).map(normalizeNews) : [];
  });
}

// General market news → [{ headline, summary, source, url, datetime }]
async function getMarketNews(category = 'general') {
  return cached(`mnews:${category}`, 10 * 60 * 1000, async () => {
    const arr = await get(`/news?category=${encodeURIComponent(category)}`);
    return Array.isArray(arr) ? arr.slice(0, 15).map(normalizeNews) : [];
  });
}

// Resolve a free-text name/ticker to a tradable symbol → 'AAPL' or null
async function resolveSymbol(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  return cached(`sym:${q.toLowerCase()}`, 24 * 60 * 60 * 1000, async () => {
    const r = await get(`/search?q=${encodeURIComponent(q)}`);
    if (!r || !Array.isArray(r.result) || !r.result.length) return null;
    // Prefer a plain stock symbol with no exchange suffix dot
    const best = r.result.find((x) => x.symbol && !x.symbol.includes('.')) || r.result[0];
    return best ? best.symbol : null;
  });
}

function normalizeNews(n) {
  return {
    headline: n.headline || '',
    summary: n.summary || '',
    source: n.source || '',
    url: n.url || '',
    datetime: n.datetime ? new Date(n.datetime * 1000).toISOString() : null,
    related: n.related || '',
  };
}

module.exports = {
  hasMarketData,
  getQuote,
  getQuotes,
  getCompanyNews,
  getMarketNews,
  resolveSymbol,
};
