// services/grounding.js
// Live web + news grounding via Exa (https://api.exa.ai). Replaces the earlier
// Bing integration (which never went live). Pluggable: returns [] when no
// EXA_API_KEY is set, so research/radar degrade to market-data-only (or
// pure-model) answers gracefully.
//
// SETUP (Render): EXA_API_KEY = <key>   (already provisioned)
// Reference: https://docs.exa.ai/reference/search-api-guide-for-coding-agents
//   - POST /search with { query, type, numResults, category?, contents }
//   - contents.highlights = token-efficient excerpts; text/summary/highlights
//     MUST be nested under `contents`.
//   - Freshness via contents.maxAgeHours (e.g. 24 for news).
//
// The public contract (hasGrounding / searchWeb / searchNews) is unchanged so
// services/research.js and services/radar.js keep working; deepSearch is new for
// the PR 8 research Gather phase.

const EXA_URL = 'https://api.exa.ai/search';
const EXA_TIMEOUT_MS = Number(process.env.EXA_TIMEOUT_MS) || 20000;

function key() {
  return (process.env.EXA_API_KEY || '').trim();
}
function hasGrounding() {
  return !!key();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Core Exa /search call. Returns the raw results array (or [] on any failure —
// grounding is always best-effort and must never break the caller).
async function exaSearch(query, { type = 'auto', numResults = 5, category, maxAgeHours, maxChars } = {}) {
  if (!hasGrounding() || !query) return [];
  const contents = { highlights: true };
  if (maxChars) contents.text = { maxCharacters: maxChars };
  if (maxAgeHours != null) contents.maxAgeHours = maxAgeHours;

  const body = { query, type, numResults, contents };
  if (category) body.category = category;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXA_TIMEOUT_MS);
  try {
    const res = await fetch(EXA_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Exa ' + res.status);
    const data = await res.json();
    return Array.isArray(data && data.results) ? data.results : [];
  } catch (e) {
    console.error('grounding: Exa search failed:', e.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Best short excerpt for a result: prefer highlights, fall back to a text slice.
function excerpt(r) {
  if (Array.isArray(r.highlights) && r.highlights.length) return r.highlights.join(' … ');
  if (typeof r.text === 'string') return r.text.slice(0, 400);
  return '';
}

// Web results → [{ title, snippet, url, source }]
async function searchWeb(query, count = 5) {
  const results = await exaSearch(query, { type: 'auto', numResults: count });
  return results.map((r) => ({
    title: r.title || '',
    snippet: excerpt(r),
    url: r.url || '',
    source: hostOf(r.url),
  }));
}

// News results → [{ title, snippet, url, source, datePublished }]
async function searchNews(query, count = 6) {
  const results = await exaSearch(query, { type: 'auto', numResults: count, category: 'news', maxAgeHours: 72 });
  return results.map((r) => ({
    title: r.title || '',
    snippet: excerpt(r),
    url: r.url || '',
    source: r.author || hostOf(r.url),
    datePublished: r.publishedDate || null,
  }));
}

// Deeper Gather for the research pipeline: more results + capped full text.
// → [{ title, snippet, text, url, source, datePublished }]
async function deepSearch(query, count = 8) {
  const results = await exaSearch(query, { type: 'auto', numResults: count, maxChars: 2000 });
  return results.map((r) => ({
    title: r.title || '',
    snippet: excerpt(r),
    text: typeof r.text === 'string' ? r.text.slice(0, 2000) : '',
    url: r.url || '',
    source: hostOf(r.url),
    datePublished: r.publishedDate || null,
  }));
}

module.exports = { hasGrounding, searchWeb, searchNews, deepSearch, exaSearch };
