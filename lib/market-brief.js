'use strict';
// lib/market-brief.js — PURE helpers for the Daily market brief.
// No I/O: date keying, model-output parsing/sanitising, the deterministic
// no-model fallback, and price-series assembly from cached history.
// Tested in test/weekly-recap.test.js.

const BRIEF_TZ = 'Australia/Sydney';

function sydneyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRIEF_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Parse the reasoner's JSON reply → { headline, story[], outlook, lookingAhead[] }
// or null when unusable. Unknown keys are dropped; lengths are capped.
function parseBriefJson(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const headline = clean(j.headline, 90);
  if (!headline) return null;
  const story = (Array.isArray(j.story) ? j.story : [j.story]).map((p) => clean(p, 700)).filter(Boolean).slice(0, 2);
  const outlook = clean(j.outlook, 700);
  const lookingAhead = (Array.isArray(j.lookingAhead) ? j.lookingAhead : [])
    .map((e) => ({ date: clean(e && e.date, 40), title: clean(e && e.title, 120), body: clean(e && e.body, 420) }))
    .filter((e) => e.title && e.body)
    .slice(0, 3);
  return { headline, story, outlook, lookingAhead };
}

function signedPct(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return `${v >= 0 ? 'up' : 'down'} ${Math.abs(v).toFixed(2)}%`;
}

// Deterministic brief from raw data only — used when no model is configured or
// the model call fails. States only figures present in `data`.
//   data: { indices: [{ label, changePercent }], aud: { rate, changePercent } | null, news: [{ title, source }] }
function fallbackBrief({ indices = [], aud = null, news = [] } = {}) {
  const live = (indices || []).filter((i) => i && i.changePercent != null && Number.isFinite(Number(i.changePercent)));
  const lead = live[0];
  const parts = [];
  if (lead) parts.push(`${lead.label} ${signedPct(lead.changePercent)}`);
  if (aud && Number.isFinite(Number(aud.rate))) parts.push(`Aussie dollar at US${(Number(aud.rate) * 100).toFixed(2)}c`);

  if (!parts.length && !(news || []).length) {
    return {
      headline: 'Today’s market data isn’t available yet',
      story: ['Live market prices and news couldn’t be loaded right now. Check back a little later.'],
      outlook: '',
      lookingAhead: [],
    };
  }

  const story = [];
  const moves = live.map((i) => `${i.label} ${signedPct(i.changePercent)}`);
  const sentence = [];
  if (moves.length) sentence.push(`In the latest session, ${moves.join(', ')} (US-listed ETF proxies, in USD).`);
  if (aud && Number.isFinite(Number(aud.rate))) {
    const chg = aud.changePercent != null && Number.isFinite(Number(aud.changePercent)) ? `, ${signedPct(aud.changePercent)} on the previous reading` : '';
    sentence.push(`The Australian dollar was at US${(Number(aud.rate) * 100).toFixed(2)}c${chg}.`);
  }
  if (sentence.length) story.push(sentence.join(' '));
  const heads = (news || []).filter((n) => n && n.title).slice(0, 3);
  if (heads.length) story.push(`In the news: ${heads.map((n) => n.title.replace(/\.$/, '')).join('; ')}.`);

  return {
    headline: parts.length ? parts.join(', ') : clean(heads[0].title, 90),
    story,
    outlook: '',
    lookingAhead: [],
  };
}

// Oldest→newest closing prices for `symbol` from cached daily briefs, with
// today's live price appended. history rows: { brief_date, payload: { indices } }.
function seriesFromHistory(history, symbol, todayPrice) {
  const rows = (Array.isArray(history) ? history : [])
    .filter((r) => r && r.payload && Array.isArray(r.payload.indices))
    .sort((a, b) => String(a.brief_date).localeCompare(String(b.brief_date)));
  const out = [];
  for (const r of rows) {
    const hit = r.payload.indices.find((i) => i && i.symbol === symbol);
    const p = hit ? Number(hit.price) : NaN;
    if (hit && hit.price != null && Number.isFinite(p)) out.push(p);
  }
  if (todayPrice != null && Number.isFinite(Number(todayPrice))) out.push(Number(todayPrice));
  return out;
}

module.exports = { sydneyDate, parseBriefJson, fallbackBrief, seriesFromHistory, BRIEF_TZ };
