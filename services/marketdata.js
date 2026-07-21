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

// Prune expired cache entries every minute to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.exp < now) cache.delete(k);
  }
}, 60_000).unref();
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
// TODO: verify unused — exported but not called by any route or service yet
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

// ─── Global indices ───────────────────────────────────────────────────────────
// Market snapshot rows. Finnhub's free tier cannot quote raw index symbols
// (^GSPC, ^AXJO, … return no data), so we quote liquid US-listed ETF proxies
// instead and label each row with the market it tracks. Cached for 5 minutes.
//
// IMPORTANT: `price` is the ETF's USD share price, NOT the underlying index
// level — every row carries currency:'USD' and isProxy:true so the dashboard
// and the advisor prompt can't present these as index points or as AUD.
const GLOBAL_INDICES = [
  { symbol: 'EWA',  name: 'Australia (EWA)',      region: 'AU', exchange: 'NYSE Arca', currency: 'USD', isProxy: true, tracks: 'MSCI Australia' },
  { symbol: 'SPY',  name: 'S&P 500 (SPY)',        region: 'US', exchange: 'NYSE Arca', currency: 'USD', isProxy: true, tracks: 'S&P 500' },
  { symbol: 'QQQ',  name: 'Nasdaq 100 (QQQ)',     region: 'US', exchange: 'NASDAQ',    currency: 'USD', isProxy: true, tracks: 'Nasdaq 100' },
  { symbol: 'DIA',  name: 'Dow Jones (DIA)',      region: 'US', exchange: 'NYSE Arca', currency: 'USD', isProxy: true, tracks: 'Dow Jones Industrial Average' },
  { symbol: 'VGK',  name: 'Europe (VGK)',         region: 'EU', exchange: 'NYSE Arca', currency: 'USD', isProxy: true, tracks: 'FTSE Developed Europe' },
  { symbol: 'EWJ',  name: 'Japan (EWJ)',          region: 'JP', exchange: 'NYSE Arca', currency: 'USD', isProxy: true, tracks: 'MSCI Japan' },
  { symbol: 'VT',   name: 'World (VT)',           region: 'Global', exchange: 'NYSE Arca', currency: 'USD', isProxy: true, tracks: 'FTSE Global All Cap' },
];

// Fetch live quotes for all major global indices.
// Returns array of { symbol, name, region, exchange, price, change, changePercent, open, high, low, prevClose }
// Indices that fail (no Finnhub coverage, outside market hours) are skipped gracefully.
async function getGlobalIndices() {
  if (!hasMarketData()) {
    return GLOBAL_INDICES.map(idx => ({ ...idx, price: null, change: null, changePercent: null }));
  }
  return cached('global-indices', 5 * 60 * 1000, async () => {
    const results = [];
    // Batch in groups of 4 to avoid hammering the API
    for (let i = 0; i < GLOBAL_INDICES.length; i += 4) {
      const batch = GLOBAL_INDICES.slice(i, i + 4);
      await Promise.all(batch.map(async (idx) => {
        try {
          const q = await get(`/quote?symbol=${encodeURIComponent(idx.symbol)}`);
          if (q && q.c) {
            results.push({
              ...idx,
              price: q.c,
              change: Math.round((q.c - q.pc) * 100) / 100,
              changePercent: q.pc ? Math.round(((q.c - q.pc) / q.pc) * 10000) / 100 : 0,
              open: q.o || null,
              high: q.h || null,
              low: q.l || null,
              prevClose: q.pc || null,
            });
          } else {
            results.push({ ...idx, price: null, change: null, changePercent: null });
          }
        } catch (_) {
          results.push({ ...idx, price: null, change: null, changePercent: null });
        }
      }));
    }
    // Return in original order
    return GLOBAL_INDICES.map(idx => results.find(r => r.symbol === idx.symbol) || { ...idx, price: null, change: null, changePercent: null });
  });
}

// Format global indices as a compact prompt-ready string for AI context injection.
// TODO: verify unused — exported but not called by any route or service yet
function formatIndicesForPrompt(indices) {
  const live = indices.filter(i => i.price !== null);
  if (!live.length) return '';
  const lines = live.map(i => {
    const sign = i.changePercent >= 0 ? '+' : '';
    const unit = i.currency ? ' ' + i.currency : '';
    const proxy = i.isProxy ? ` [ETF proxy${i.tracks ? ' for ' + i.tracks : ''}, not the index level]` : '';
    return `${i.name} (${i.region}): ${i.price.toLocaleString()}${unit} ${sign}${i.changePercent}%${proxy}`;
  });
  return 'Global markets right now (ETF share prices in USD, used as proxies for their indices):\n' + lines.join('\n');
}

// Upcoming earnings for a set of tickers (next ~90 days), soonest first.
// → [{ symbol, date, epsEstimate, hour }]. Empty without a key or symbols.
async function getUpcomingEarnings(symbols) {
  if (!hasMarketData() || !Array.isArray(symbols) || !symbols.length) return [];
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const uniq = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(0, 25);
  const out = [];
  for (const sym of uniq) {
    try {
      const r = await cached(`earn:${sym}:${from}`, 6 * 60 * 60 * 1000, () => get(`/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(sym)}`));
      const rows = (r && Array.isArray(r.earningsCalendar)) ? r.earningsCalendar : [];
      for (const e of rows) {
        if (e && e.date) out.push({ symbol: e.symbol || sym, date: e.date, epsEstimate: e.epsEstimate ?? null, hour: e.hour || null });
      }
    } catch (_) { /* skip this symbol */ }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = {
  hasMarketData,
  getQuote,
  getQuotes,
  getCompanyNews,
  getMarketNews,
  resolveSymbol,
  getGlobalIndices,
  getUpcomingEarnings,
  formatIndicesForPrompt,
  GLOBAL_INDICES,
};
