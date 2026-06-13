// services/research.js
// Runs a grounded research report: pull live market news (Finnhub) + web/news
// grounding (Bing), then have Azure OpenAI synthesise an education-only report
// that cites its sources. Degrades gracefully — with no data keys it still
// produces a model-only answer; with no LLM it returns a clear message.

const advisor = require('./advisor');
const marketdata = require('./marketdata');
const grounding = require('./grounding');

function aud(n) { n = Number(n) || 0; return '$' + n.toLocaleString('en-AU', { maximumFractionDigits: 0 }); }

function profileLine(profile) {
  const p = profile || {};
  const bits = [];
  if (p.profession) bits.push(p.profession);
  if (p.annual_income) bits.push(`income ${aud(p.annual_income)}`);
  if (p.super_balance) bits.push(`super ${aud(p.super_balance)}`);
  if (p.investment_portfolio) bits.push(`investments ${aud(p.investment_portfolio)}`);
  if (p.hecs_balance) bits.push(`HECS ${aud(p.hecs_balance)}`);
  if (p.property_value) bits.push(`property ${aud(p.property_value)}`);
  if (p.prefers_halal) bits.push('prefers halal-compliant');
  if (p.prefers_esg) bits.push('prefers ESG/ethical');
  return bits.length ? bits.join(', ') : 'no financial profile on file yet';
}

// Returns { report, sources } — sources: [{ title, url, source }]
async function runResearch(user, profile, mizan, question) {
  if (!advisor.hasAdvisor()) {
    return {
      report: "Research needs the AI engine switched on. Add your Azure OpenAI keys "
        + "(AZURE_OPENAI_*) on the server and this will run for real.",
      sources: [],
    };
  }

  const sources = [];
  const contextChunks = [];

  // 1. Live market news (Finnhub)
  if (marketdata.hasMarketData()) {
    try {
      const news = await marketdata.getMarketNews('general');
      if (news.length) {
        contextChunks.push('Recent market news (Finnhub):\n' +
          news.slice(0, 6).map((n) => `- ${n.headline} (${n.source})`).join('\n'));
        news.slice(0, 6).forEach((n) => { if (n.url) sources.push({ title: n.headline, url: n.url, source: n.source }); });
      }
    } catch (e) { console.error('research: market news failed:', e.message); }
  }

  // 2. Web + news grounding (Bing)
  if (grounding.hasGrounding()) {
    try {
      const [web, news] = await Promise.all([
        grounding.searchWeb(question, 5),
        grounding.searchNews(question, 5),
      ]);
      [...web, ...news].forEach((r) => {
        contextChunks.push(`Source: ${r.title}\n${r.snippet}\n(${r.url})`);
        if (r.url) sources.push({ title: r.title, url: r.url, source: r.source });
      });
    } catch (e) { console.error('research: grounding failed:', e.message); }
  }

  const dataBlock = contextChunks.length
    ? `\n\nLive context to ground your analysis (cite as [1], [2]… matching the order of the sources list):\n${contextChunks.join('\n\n')}`
    : '\n\n(No live market/web data is connected — answer from general knowledge and clearly note that figures may be out of date.)';

  const system = [
    'You are Mizan Research, an education-only financial research analyst for Australians.',
    'Produce a structured, decision-useful report — NOT personal financial advice. Explain scenarios, trade-offs and mechanisms so the user can decide; remind them to do their own research / see a licensed adviser for big moves.',
    'Australian context: superannuation (SG 12%), HECS-HELP (indexed 1 June), franking credits, CGT discount, EOFY 30 June, negative gearing, RBA cash rate, ASX.',
    'Structure: a one-line summary, then 2-4 short sections with headers, then a "What this means for you" close. Use AUD. Cite live sources inline as [1], [2] where you used them.',
    `The user: ${profileLine(profile)}.`,
    mizan && mizan.hasData ? `Their Mizan wellbeing score is ${mizan.score}/100 (${mizan.band}).` : '',
  ].filter(Boolean).join('\n');

  const report = await advisor.complete([
    { role: 'system', content: system },
    { role: 'user', content: `Research question: ${question}${dataBlock}` },
  ], { maxTokens: 1400, temperature: 0.5 });

  // De-dupe sources by url, keep order
  const seen = new Set();
  const uniqueSources = sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
  return { report, sources: uniqueSources };
}

module.exports = { runResearch };
