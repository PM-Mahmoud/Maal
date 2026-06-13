// services/grounding.js
// Live web + news grounding via Microsoft Bing Search (v7 REST shape).
// Pluggable: returns [] when not configured, so research/radar degrade to
// market-data-only (or pure-model) answers gracefully.
//
// SETUP: create a Bing Search resource in your Azure account, then on Render:
//   BING_SEARCH_KEY      = <resource key>
//   BING_SEARCH_ENDPOINT = https://api.bing.microsoft.com   (default; override
//                          if your Azure resource exposes a custom endpoint)
// Endpoint is configurable so this also works against an Azure-hosted/Foundry
// grounding gateway that mirrors the Bing v7 response shape.

function key() {
  return (process.env.BING_SEARCH_KEY || '').trim();
}
function endpoint() {
  return (process.env.BING_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com').replace(/\/+$/, '');
}
function hasGrounding() {
  return !!key();
}

async function bingGet(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(endpoint() + path, {
      signal: ctrl.signal,
      headers: { 'Ocp-Apim-Subscription-Key': key(), Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Bing ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Web results → [{ title, snippet, url, source }]
async function searchWeb(query, count = 5) {
  if (!hasGrounding() || !query) return [];
  const data = await bingGet(`/v7.0/search?q=${encodeURIComponent(query)}&count=${count}&mkt=en-AU&safeSearch=Moderate`);
  const pages = data && data.webPages && Array.isArray(data.webPages.value) ? data.webPages.value : [];
  return pages.map((p) => ({ title: p.name || '', snippet: p.snippet || '', url: p.url || '', source: hostOf(p.url) }));
}

// News results → [{ title, snippet, url, source, datePublished }]
async function searchNews(query, count = 6) {
  if (!hasGrounding() || !query) return [];
  const data = await bingGet(`/v7.0/news/search?q=${encodeURIComponent(query)}&count=${count}&mkt=en-AU&sortBy=Date`);
  const items = data && Array.isArray(data.value) ? data.value : [];
  return items.map((n) => ({
    title: n.name || '',
    snippet: n.description || '',
    url: n.url || '',
    source: (n.provider && n.provider[0] && n.provider[0].name) || hostOf(n.url),
    datePublished: n.datePublished || null,
  }));
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

module.exports = { hasGrounding, searchWeb, searchNews };
