// services/market-brief.js — the Daily market brief (Home → story).
//
// Once per Sydney calendar day: gather live market data (Finnhub ETF proxies
// via services/marketdata, AUD/USD from the ECB reference-rate feed via
// Frankfurter, Australian + global market news via Exa grounding and Finnhub),
// ask the gateway `reasoner` role to write an education-only brief using ONLY
// those facts, and cache the result in market_briefs. Every input degrades
// gracefully: with no keys the brief is a deterministic summary of whatever
// data loaded (lib/market-brief.fallbackBrief), never invented figures.

const marketdata = require('./marketdata');
const grounding = require('./grounding');
const gateway = require('./gateway');
const briefsDb = require('../db/briefs');
const { sydneyDate, parseBriefJson, fallbackBrief, seriesFromHistory } = require('../lib/market-brief');

// US-listed ETF proxies (Finnhub's free tier can't quote raw indices). Shown
// with the % change only — the price is the ETF's USD share price.
const BRIEF_INDICES = [
  { symbol: 'EWA', label: 'Australian shares', sub: 'EWA · MSCI Australia proxy' },
  { symbol: 'SPY', label: 'US shares (S&P 500)', sub: 'SPY · S&P 500 proxy' },
  { symbol: 'QQQ', label: 'US tech (Nasdaq 100)', sub: 'QQQ · Nasdaq 100 proxy' },
];

const FX_ENDPOINTS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// AUD→USD daily reference rates for the last ~30 days → { rate, changePercent, series, asOf } | null
async function getAudUsd() {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 32 * 86400000).toISOString().slice(0, 10);
  for (const base of FX_ENDPOINTS) {
    try {
      const j = await fetchJson(`${base}/${start}..${end}?from=AUD&to=USD`);
      const dates = Object.keys((j && j.rates) || {}).sort();
      const series = dates.map((d) => Number(j.rates[d] && j.rates[d].USD)).filter(Number.isFinite);
      if (series.length < 1) continue;
      const rate = series[series.length - 1];
      const prev = series.length > 1 ? series[series.length - 2] : null;
      return {
        rate,
        changePercent: prev ? Math.round(((rate - prev) / prev) * 10000) / 100 : null,
        series,
        asOf: dates[dates.length - 1],
      };
    } catch (_) { /* try the next endpoint */ }
  }
  return null;
}

async function getIndices() {
  let all = [];
  try { all = (await marketdata.getGlobalIndices()) || []; } catch (_) { all = []; }
  return BRIEF_INDICES.map((meta) => {
    const q = all.find((x) => x && x.symbol === meta.symbol) || {};
    return {
      ...meta,
      price: q.price ?? null,
      changePercent: q.changePercent ?? null,
    };
  });
}

function dedupeNews(items) {
  const seen = new Set();
  const out = [];
  for (const n of items) {
    const key = String(n.title || '').toLowerCase().slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

async function getNews() {
  const [au, rba, calendar, global] = await Promise.all([
    grounding.searchNews('ASX 200 share market today Australian dollar', 5).catch(() => []),
    grounding.searchNews('Reserve Bank of Australia cash rate inflation outlook', 4).catch(() => []),
    grounding.searchNews('Australia economic calendar this week CPI jobs data RBA meeting', 4).catch(() => []),
    marketdata.getMarketNews('general').catch(() => []),
  ]);
  const finnhub = (global || []).slice(0, 6).map((n) => ({
    title: n.headline, snippet: n.summary, url: n.url, source: n.source, datePublished: n.datetime,
  }));
  return dedupeNews([...au, ...rba, ...calendar, ...finnhub].filter((n) => n && n.title)).slice(0, 14);
}

const SYSTEM_PROMPT = [
  'You write the Daily market brief for Maal, an Australian financial education app.',
  'Audience: everyday Australians. Use Australian English (e.g. "realise", "organisation"), AUD context, and refer to the ASX, the RBA cash rate, the Australian dollar and super where the sources support it. Cover global markets as they affect Australians.',
  'STRICT RULES:',
  '- Use ONLY facts, figures and dates that appear in the DATA block. Never invent numbers, dates, forecasts or events. If something is not in the data, leave it out.',
  '- The index rows are US-listed ETF proxies quoted in USD; describe them by the market they track and only cite their % change, never as index points.',
  '- Education only: no buy/sell/hold recommendations, no personal advice, no price targets. Do not promote interest-bearing products (savings accounts, term deposits, bonds).',
  '- Plain, calm, neutral tone. No hype.',
  'Respond with ONLY a JSON object:',
  '{"headline": "<= 60 chars, the day\'s main market story", "story": ["one paragraph (2-4 sentences) on what happened and why"], "outlook": "one paragraph on what it could mean and what markets are watching", "lookingAhead": [{"date": "Weekday D Month", "title": "<= 80 chars", "body": "1-2 sentences on why it matters"}]}',
  'lookingAhead: up to 3 UPCOMING scheduled events (e.g. RBA decision, CPI, jobs data, US Fed) that are explicitly mentioned with a date in the data. If none are, return an empty array.',
].join('\n');

function buildDataBlock({ indices, aud, news, date }) {
  const lines = [`Today (Sydney): ${date}`, '', 'Market moves (latest session, ETF proxies in USD):'];
  for (const i of indices) {
    lines.push(`- ${i.label} [${i.symbol}]: ${i.changePercent == null ? 'no data' : (i.changePercent >= 0 ? '+' : '') + i.changePercent + '%'}`);
  }
  lines.push('', aud ? `AUD/USD (ECB reference rate, ${aud.asOf}): ${aud.rate.toFixed(4)}${aud.changePercent == null ? '' : ` (${aud.changePercent >= 0 ? '+' : ''}${aud.changePercent}% vs previous)`}` : 'AUD/USD: no data');
  lines.push('', 'News (title — source — date — excerpt):');
  news.forEach((n, idx) => {
    lines.push(`[${idx + 1}] ${n.title} — ${n.source || ''} — ${n.datePublished ? String(n.datePublished).slice(0, 10) : ''} — ${String(n.snippet || '').slice(0, 500)}`);
  });
  return lines.join('\n');
}

async function generate(date) {
  const [indices, aud, news, history] = await Promise.all([
    getIndices(),
    getAudUsd().catch(() => null),
    getNews().catch(() => []),
    briefsDb.getRecentMarketBriefs(date, 30).catch(() => []),
  ]);

  let brief = null;
  let ai = false;
  const hasInputs = indices.some((i) => i.changePercent != null) || aud || news.length;
  if (hasInputs && gateway.hasRole('reasoner')) {
    try {
      const raw = await gateway.completeAs('reasoner', [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `<data>\n${buildDataBlock({ indices, aud, news, date })}\n</data>\n\nWrite today's brief as JSON.` },
      ], { maxTokens: 900, temperature: 0.3, timeoutMs: 45000 });
      brief = parseBriefJson(raw);
      ai = !!brief;
    } catch (e) {
      console.error('[market-brief] model call failed, using data-only brief:', e.message);
    }
  }
  if (!brief) brief = fallbackBrief({ indices, aud, news });

  return {
    date,
    ...brief,
    indices: indices.map((i) => ({ ...i, series: seriesFromHistory(history, i.symbol, i.price) })),
    aud,
    sources: news.slice(0, 8).map((n) => ({ title: n.title, url: n.url, source: n.source })),
    ai,
    available: !!hasInputs,
  };
}

// Single-flight per day so concurrent first requests trigger one generation.
const inFlight = new Map();

async function getDailyBrief(now = new Date()) {
  const date = sydneyDate(now);
  try {
    const cached = await briefsDb.getMarketBrief(date);
    if (cached) return { ...cached.payload, generatedAt: cached.generated_at };
  } catch (e) {
    console.error('[market-brief] cache read failed:', e.message);
  }
  if (inFlight.has(date)) return inFlight.get(date);
  const p = (async () => {
    const payload = await generate(date);
    // Only cache a brief that had real inputs, so an outage doesn't pin an
    // empty brief for the whole day.
    if (payload.available) {
      try {
        const row = await briefsDb.saveMarketBrief(date, payload);
        return { ...row.payload, generatedAt: row.generated_at };
      } catch (e) {
        console.error('[market-brief] cache write failed:', e.message);
      }
    }
    return { ...payload, generatedAt: new Date().toISOString() };
  })().finally(() => inFlight.delete(date));
  inFlight.set(date, p);
  return p;
}

module.exports = { getDailyBrief, getAudUsd, BRIEF_INDICES };
