// services/research.js
// Runs a grounded research report: pull live market news (Finnhub) + web/news
// grounding (Bing), then have Azure OpenAI synthesise an education-only report
// that cites its sources. Degrades gracefully — with no data keys it still
// produces a model-only answer; with no LLM it returns a clear message.

const advisor = require('./advisor');
const gateway = require('./gateway');
const marketdata = require('./marketdata');
const grounding = require('./grounding');
const financialdatasets = require('./financialdatasets');
const quant = require('../lib/quant');
const researchDb = require('../db/research');

function aud(n) { n = Number(n) || 0; return '$' + n.toLocaleString('en-AU', { maximumFractionDigits: 0 }); }

function profileLine(profile) {
  const p = profile || {};
  const bits = [];
  // Career-agnostic (2026-06-25 rebrand): never inject occupation/profession — it
  // previously leaked career-specific framing (e.g. "your medical studies").
  if (p.annual_income) bits.push(`income ${aud(p.annual_income)}`);
  if (p.super_balance) bits.push(`super ${aud(p.super_balance)}`);
  if (p.investment_portfolio) bits.push(`investments ${aud(p.investment_portfolio)}`);
  if (p.hecs_balance) bits.push(`HECS ${aud(p.hecs_balance)}`);
  if (p.property_value) bits.push(`property ${aud(p.property_value)}`);
  return bits.length ? bits.join(', ') : 'no financial profile on file yet';
}

// Returns { report, sources } — sources: [{ title, url, source }]
async function runResearch(user, profile, maal, question) {
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
    ? `\n\nLive context to ground your analysis (use it to inform the answer, but do NOT cite it inline or list any sources):\n${contextChunks.join('\n\n')}`
    : '\n\n(No live market/web data is connected — answer from general knowledge and clearly note that figures may be out of date.)';

  const system = [
    'You are Maal Research, an education-only financial research analyst for Australians.',
    'Produce a structured, decision-useful report — NOT personal financial advice. Explain scenarios, trade-offs and mechanisms so the user can decide; remind them to do their own research / see a licensed adviser for big moves.',
    'Australian context: superannuation (SG 12%), HECS-HELP (indexed 1 June), franking credits, CGT discount, EOFY 30 June, negative gearing, RBA cash rate, ASX.',
    'Structure: a one-line summary, then 2-4 short sections with headers, then a "What this means for you" close. Use AUD. Write clean prose — do NOT cite sources inline (no [1], [2] markers) and do not include a sources or references list.',
    `The user: ${profileLine(profile)}.`,
    maal && maal.hasData ? `Their Maal wellbeing score is ${maal.score}/100 (${maal.band}).` : '',
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

// ─── Deep research pipeline (PR 8) ─────────────────────────────────────────
// Async, in-process: Plan → Gather → Compute → Write → Verify → Render. The
// quant (Compute) core is PURE and deterministic-tested; the Write/Verify phases
// call the gateway. Every phase degrades gracefully — missing keys just thin the
// evidence, they never abort the run.

// PLAN — pull candidate US/ASX tickers out of the question (uppercase runs that
// aren't common AU finance acronyms). Pure + testable.
const TICKER_STOPWORDS = new Set(['ASX', 'RBA', 'EOFY', 'HECS', 'ETF', 'AUD', 'USD',
  'CGT', 'SMSF', 'GST', 'ATO', 'PDS', 'FY', 'AI', 'US', 'UK', 'EU', 'CEO', 'CFO', 'IPO', 'API']);
function extractTickers(text) {
  const found = (String(text || '').match(/\b[A-Z]{2,5}\b/g) || [])
    .filter((t) => !TICKER_STOPWORDS.has(t));
  return Array.from(new Set(found)).slice(0, 5);
}

// Stable 32-bit seed from a string, so a symbol's Monte-Carlo is reproducible.
function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// COMPUTE — pure quant over gathered price series. `seriesBySymbol` maps a
// ticker to its close series (oldest→newest); `marketSeries` is the benchmark
// close series (for beta). Returns per-symbol metrics + a flag. No I/O.
function computeQuant(seriesBySymbol, marketSeries, { horizonDays = 252, sims = 1000 } = {}) {
  const marketReturns = quant.dailyReturns(marketSeries || []);
  const perSymbol = [];
  for (const [symbol, closes] of Object.entries(seriesBySymbol || {})) {
    const prices = Array.isArray(closes) ? closes : [];
    if (prices.length < 3) continue;
    const returns = quant.dailyReturns(prices);
    const vol = quant.annualizedVol(returns);
    const expected = quant.annualizedReturn(prices);
    perSymbol.push({
      symbol,
      dataPoints: prices.length,
      lastPrice: quant.round(prices[prices.length - 1], 2),
      annualizedReturn: expected,
      annualizedVol: vol,
      beta: marketReturns.length ? quant.beta(returns, marketReturns) : null,
      maxDrawdown: quant.maxDrawdown(prices),
      var95: quant.historicalVaR(returns, 0.95),
      monteCarlo: quant.monteCarlo({
        start: 10000,
        expectedReturn: expected,
        vol,
        days: horizonDays,
        sims,
        seed: seedFromString(symbol),
      }),
    });
  }
  return { perSymbol, hasData: perSymbol.length > 0 };
}

// Turn quant metrics into a compact, model-readable evidence block (facts only —
// the model narrates, it never invents these numbers).
function quantEvidence(computed) {
  if (!computed || !computed.hasData) return '';
  const pct = (n) => (n == null ? 'n/a' : (n * 100).toFixed(1) + '%');
  const lines = computed.perSymbol.map((s) => {
    const mc = s.monteCarlo.terminal;
    return `${s.symbol}: last $${s.lastPrice}, 1y return ${pct(s.annualizedReturn)}, `
      + `annualised vol ${pct(s.annualizedVol)}, beta ${s.beta == null ? 'n/a' : s.beta}, `
      + `max drawdown ${pct(s.maxDrawdown)}, 95% 1-day VaR ${pct(s.var95)}. `
      + `Monte Carlo (seeded, ${s.monteCarlo.sims} sims) of $10,000 over ${s.monteCarlo.days} trading days: `
      + `p5 $${mc.p5}, median $${mc.p50}, p95 $${mc.p95}.`;
  });
  return 'Computed quant (authoritative — use these exact figures, do not recompute):\n' + lines.join('\n');
}

// GATHER — collect market news, fundamentals, price series and web evidence.
async function gather(question, tickers) {
  const sources = [];
  const contextChunks = [];
  const seriesBySymbol = {};

  // Web + news evidence (Exa).
  if (grounding.hasGrounding()) {
    try {
      const [web, news] = await Promise.all([
        grounding.deepSearch(question, 6),
        grounding.searchNews(question, 5),
      ]);
      [...web, ...news].forEach((r) => {
        if (!r.url) return;
        contextChunks.push(`Source: ${r.title}\n${r.snippet || r.text || ''}\n(${r.url})`);
        sources.push({ title: r.title, url: r.url, source: r.source });
      });
    } catch (e) { console.error('deep research: grounding failed:', e.message); }
  }

  // Live market news (Finnhub).
  if (marketdata.hasMarketData()) {
    try {
      const news = await marketdata.getMarketNews('general');
      if (news.length) {
        contextChunks.push('Recent market news (Finnhub):\n'
          + news.slice(0, 5).map((n) => `- ${n.headline} (${n.source})`).join('\n'));
      }
    } catch (e) { console.error('deep research: market news failed:', e.message); }
  }

  // Depth: price series (Financial Datasets) for the quant phase + fundamentals.
  if (financialdatasets.hasFinancialDatasets()) {
    for (const t of tickers) {
      try {
        const closes = await financialdatasets.getCloseSeries(t, { days: 400 });
        if (closes.length >= 3) seriesBySymbol[t] = closes;
        const facts = await financialdatasets.getCompanyFacts(t);
        if (facts && (facts.name || facts.market_cap)) {
          contextChunks.push(`Fundamentals ${t}: ${facts.name || t}`
            + (facts.market_cap ? `, market cap ${aud(facts.market_cap)}` : '')
            + (facts.sector ? `, sector ${facts.sector}` : ''));
        }
      } catch (e) { console.error(`deep research: fundamentals ${t} failed:`, e.message); }
    }
  }

  return { sources, contextChunks, seriesBySymbol };
}

// The full async pipeline. Drives the job row through its phases and, on success,
// writes the report to research_reports + stores the quant result on the job.
// Never throws — failures are recorded on the job so the client can offer retry.
async function runDeepResearch({ jobId, user, profile, maal, question }) {
  try {
    if (!advisor.hasAdvisor()) {
      await researchDb.failJob(jobId, 'Research needs the AI engine configured (AZURE_OPENAI_* / gateway).');
      return;
    }

    // PLAN
    const tickers = extractTickers(question);

    // GATHER
    await researchDb.setJobPhase(jobId, 'gather');
    const { sources, contextChunks, seriesBySymbol } = await gather(question, tickers);

    // COMPUTE — benchmark = S&P 500 proxy if available, else empty (beta n/a).
    await researchDb.setJobPhase(jobId, 'compute');
    let marketSeries = [];
    if (financialdatasets.hasFinancialDatasets()) {
      try { marketSeries = await financialdatasets.getCloseSeries('SPY', { days: 400 }); }
      catch { /* beta degrades to n/a */ }
    }
    const computed = computeQuant(seriesBySymbol, marketSeries);

    // WRITE
    await researchDb.setJobPhase(jobId, 'write');
    const evidence = [quantEvidence(computed), contextChunks.join('\n\n')].filter(Boolean).join('\n\n');
    const dataBlock = evidence
      ? `\n\nEvidence to ground your analysis (do NOT cite inline or list sources):\n${evidence}`
      : '\n\n(No live data connected — answer from general knowledge and note figures may be dated.)';
    const messages = [
      { role: 'system', content: deepSystemPrompt(profile, maal) },
      { role: 'user', content: `Research question: ${question}${dataBlock}` },
    ];
    let report = await advisor.complete(messages, { role: 'reasoner', maxTokens: 1800, temperature: 0.5 });

    // VERIFY (blocking critique + one revision; ships regardless).
    await researchDb.setJobPhase(jobId, 'verify');
    try {
      const v = await gateway.verifyAndRevise({ messages, draft: report, opts: { role: 'reasoner', maxTokens: 1800 } });
      if (v && v.text) report = v.text;
    } catch (e) { console.error('deep research: verify failed (shipping draft):', e.message); }

    // RENDER — persist the report; the PDF is generated on demand by the route.
    await researchDb.setJobPhase(jobId, 'render');
    const seen = new Set();
    const uniqueSources = sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
    const reportId = await researchDb.createReport(user ? user.id : profile.user_id, question);
    await researchDb.completeReport(reportId, report, uniqueSources);
    await researchDb.completeJob(jobId, reportId, { quant: computed, tickers, sourceCount: uniqueSources.length });
  } catch (e) {
    console.error('deep research pipeline failed:', e.message);
    await researchDb.failJob(jobId, 'The research engine hit a snag — please run it again.');
  }
}

function deepSystemPrompt(profile, maal) {
  return [
    'You are Maal Research, an education-only financial research analyst for Australians.',
    'Produce a structured, decision-useful report — NOT personal financial advice. Explain scenarios, trade-offs and mechanisms so the user can decide; remind them to do their own research / see a licensed adviser for big moves.',
    'Australian context: superannuation (SG 12%), HECS-HELP (indexed 1 June), franking credits, CGT discount, EOFY 30 June, negative gearing, RBA cash rate, ASX.',
    'When quant figures are supplied, weave them into plain-English insight (what the volatility/beta/drawdown/Monte-Carlo range MEANS for the user) — never restate them as a raw list and never invent numbers not given.',
    'Structure: a one-line summary, then 3-5 short sections with "## " markdown headers, then a "## What this means for you" close. Use AUD. Write clean prose — do NOT cite sources inline (no [1] markers) and do not include a sources list.',
    `The user: ${profileLine(profile)}.`,
    maal && maal.hasData ? `Their Maal wellbeing score is ${maal.score}/100 (${maal.band}).` : '',
  ].filter(Boolean).join('\n');
}

module.exports = { runResearch, runDeepResearch, computeQuant, extractTickers, seedFromString, quantEvidence };
