// services/radar.js
// Evaluates a Radar watch: gather live data (Finnhub quotes/news + Bing news),
// ask Azure to judge whether the user's condition has triggered, and notify by
// email/SMS when it has. Degrades gracefully without data/LLM keys.

const advisor = require('./advisor');
const marketdata = require('./marketdata');
const grounding = require('./grounding');
const radarDb = require('../db/radar');
const { findUserById } = require('../db/users');
const { getProfileByUserId } = require('../db/profiles');
const { sendEmail } = require('./email');
const { sendSms } = require('./sms');

// Pull ticker-like tokens from a free-text prompt, e.g. "NVDA", "BHP".
function extractSymbols(text) {
  const found = (String(text).match(/\b[A-Z]{2,5}\b/g) || [])
    .filter((t) => !['ASX', 'RBA', 'EOFY', 'HECS', 'ETF', 'AUD', 'USD', 'CGT', 'SMSF', 'GST'].includes(t));
  return Array.from(new Set(found)).slice(0, 5);
}

const BASE_URL = (process.env.BASE_URL || 'https://hellomaal.com').replace(/\/+$/, '');

// Evaluate one radar → { alerted, summary }
async function evaluateRadar(radar, user, profile) {
  if (!advisor.hasAdvisor()) {
    return { alerted: false, summary: 'AI engine not configured — add Azure OpenAI keys to enable Radar.' };
  }

  const dataChunks = [];

  // Quotes for any tickers on the radar
  const symbols = (radar.symbols && radar.symbols.length) ? radar.symbols : extractSymbols(radar.prompt);
  if (symbols.length && marketdata.hasMarketData()) {
    const quotes = await marketdata.getQuotes(symbols);
    if (quotes.length) {
      dataChunks.push('Live quotes:\n' + quotes.map((q) =>
        `- ${q.symbol}: $${q.price} (${q.percent >= 0 ? '+' : ''}${(q.percent || 0).toFixed(2)}% today)`).join('\n'));
    }
    // Company news for the first symbol
    try {
      const news = await marketdata.getCompanyNews(symbols[0], 3);
      if (news.length) dataChunks.push(`Recent ${symbols[0]} news:\n` + news.map((n) => `- ${n.headline}`).join('\n'));
    } catch (e) { /* ignore */ }
  }

  // Bing news for the watch topic
  if (grounding.hasGrounding()) {
    try {
      const news = await grounding.searchNews(radar.prompt, 4);
      if (news.length) dataChunks.push('Latest news:\n' + news.map((n) => `- ${n.title} (${n.source})`).join('\n'));
    } catch (e) { /* ignore */ }
  }

  const dataBlock = dataChunks.length ? dataChunks.join('\n\n') : '(No live market/news data available right now.)';

  const system = [
    'You are Maal Radar, monitoring a standing financial watch for an Australian user (education only, not advice).',
    'Decide whether the user\'s condition warrants alerting them RIGHT NOW based on the live data provided.',
    'Reply in EXACTLY this format:',
    'VERDICT: ALERT  (only if the condition is clearly met or something genuinely noteworthy happened) — otherwise VERDICT: OK',
    'Then one short paragraph (2-3 sentences) the user would receive: what happened and why it matters. Plain language, AUD.',
    'Be conservative: only ALERT on real, material changes — not routine noise.',
  ].join('\n');

  const out = await advisor.complete([
    { role: 'system', content: system },
    { role: 'user', content: `Watch condition: "${radar.prompt}"\n\nLive data:\n${dataBlock}` },
  ], { maxTokens: 300, temperature: 0.3 });

  const alerted = /VERDICT:\s*ALERT/i.test(out);
  const summary = out.replace(/VERDICT:\s*(ALERT|OK)\s*/i, '').trim();
  return { alerted, summary };
}

async function notify(radar, user, summary) {
  const subject = '📡 Maal Radar alert';
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;">
    <h2 style="font-weight:600;">Your radar flagged something</h2>
    <p style="color:#444;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;">Watching: ${escapeHtml(radar.prompt)}</p>
    <p style="font-size:0.95rem;line-height:1.6;color:#111;">${escapeHtml(summary)}</p>
    <p style="margin-top:1.5rem;"><a href="${BASE_URL}/dashboard/radar" style="background:#115832;color:#fff;padding:0.6rem 1.2rem;border-radius:999px;text-decoration:none;">Open Radar</a></p>
    <p style="font-size:0.72rem;color:#888;margin-top:1.5rem;">Education only — not financial advice.</p>
  </div>`;
  const text = `Maal Radar alert\nWatching: ${radar.prompt}\n\n${summary}\n\n${BASE_URL}/dashboard/radar`;

  if (radar.notify_email && user.email) {
    await sendEmail({ to: user.email, subject, html, text }).catch((e) => console.error('Radar email failed:', e.message));
  }
  if (radar.notify_sms && (user.phone || radar.user_phone)) {
    await sendSms(user.phone || radar.user_phone, `Maal Radar: ${summary}`.slice(0, 320)).catch((e) => console.error('Radar SMS failed:', e.message));
  }
}

// Run a single radar by id (used by "Run now" and the cron sweep)
async function runRadar(radarId, userId) {
  const radar = await radarDb.getRadar(radarId, userId);
  if (!radar) return null;
  const user = await findUserById(userId);
  const profile = await getProfileByUserId(userId);
  const { alerted, summary } = await evaluateRadar(radar, user, profile);
  await radarDb.recordRun(radar.id, { result: summary, alerted });
  await radarDb.logEvent(radar.id, alerted, summary);
  if (alerted) await notify(radar, user, summary);
  return { alerted, summary };
}

// Cron sweep — evaluate every radar whose interval has elapsed.
async function runDueRadars() {
  const due = await radarDb.dueRadars();
  let ran = 0, alerts = 0;
  for (const radar of due) {
    try {
      const user = await findUserById(radar.user_id);
      const profile = await getProfileByUserId(radar.user_id);
      const { alerted, summary } = await evaluateRadar(radar, user, profile);
      await radarDb.recordRun(radar.id, { result: summary, alerted });
      await radarDb.logEvent(radar.id, alerted, summary);
      if (alerted) { await notify(radar, user, summary); alerts++; }
      ran++;
    } catch (e) {
      console.error(`Radar ${radar.id} evaluation failed:`, e.message);
    }
  }
  return { ran, alerts };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = { evaluateRadar, runRadar, runDueRadars, extractSymbols };
