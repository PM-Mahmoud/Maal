'use strict';
// services/advisor-widgets.js
// Generative UI for Ask Maal (specs/silvia-parity-tier1-2.md, decision 5).
//
// The reasoner may request an inline visual by emitting a fenced directive in
// its reply:
//     ```maal-widget {"source":"networth_composition","title":"..."}```
// and suggest follow-ups with:
//     ```maal-followups ["...","..."]```
//
// The model NEVER supplies chart data — it only names a whitelisted `source`.
// The server computes the data from the user's real financial data here, so
// figures can't be fabricated and a saved widget stays LIVE (its source is
// re-run from the DB when the dashboard loads). Each source also carries an
// INTERNAL citation label (we cite the user's own app data, never web/RAG).

const aud = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-AU');

// Whitelist of widget sources. Each compute(ctx) returns a chart-ready spec
// { type, data } from ctx (already assembled by the caller). `cite` is the
// internal source shown as a citation pill.
const WIDGET_SOURCES = {
  networth_composition: {
    type: 'donut',
    defaultTitle: 'Net worth composition',
    cite: 'Your portfolio',
    compute(ctx) {
      const p = ctx.profile || {};
      const segments = [
        { label: 'Cash & savings', value: Number(p.cash_savings) || 0 },
        { label: 'Investments', value: Number(p.investment_portfolio) || 0 },
        { label: 'Super', value: Number(p.super_balance) || 0 },
        { label: 'Property', value: Number(p.property_value) || 0 },
      ].filter((s) => s.value > 0);
      const total = segments.reduce((s, x) => s + x.value, 0);
      return {
        type: 'donut',
        data: {
          total,
          totalLabel: aud(total),
          segments: segments.map((s) => ({ label: s.label, value: s.value, valueLabel: aud(s.value), pct: total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0 })),
        },
      };
    },
  },

  net_worth_trend: {
    type: 'line',
    defaultTitle: 'Net worth over time',
    cite: 'Your net worth history',
    compute(ctx) {
      const snaps = (ctx.snapshots || []).filter((s) => s && s.net_worth != null);
      return {
        type: 'line',
        data: {
          points: snaps.map((s) => Number(s.net_worth) || 0),
          labels: snaps.map((s) => String(s.snapshot_date || s.created_at || '').slice(0, 10)),
          format: 'currency',
        },
      };
    },
  },

  cashflow_summary: {
    type: 'stat-cards',
    defaultTitle: 'Cashflow (last 30 days)',
    cite: 'Your transactions',
    compute(ctx) {
      const txns = ctx.transactions || [];
      const inflow = txns.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
      const outflow = txns.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      return {
        type: 'stat-cards',
        data: {
          cards: [
            { label: 'Money in', value: aud(inflow) },
            { label: 'Money out', value: aud(outflow) },
            { label: 'Net', value: (inflow - outflow >= 0 ? '+' : '−') + aud(Math.abs(inflow - outflow)) },
          ],
        },
      };
    },
  },

  score_breakdown: {
    type: 'table',
    defaultTitle: 'Maal Score breakdown',
    cite: 'Your Maal Score',
    compute(ctx) {
      const maal = ctx.maal || {};
      const pillars = (maal.pillars || []).map((p) => ({ Pillar: p.label, Score: p.score + '/100' }));
      return {
        type: 'table',
        data: {
          columns: ['Pillar', 'Score'],
          rows: pillars,
          caption: maal.hasData ? 'Overall ' + maal.score + '/100 (' + maal.band + ')' : undefined,
        },
      };
    },
  },

  goals_summary: {
    type: 'table',
    defaultTitle: 'Your goals',
    cite: 'Your goals',
    compute(ctx) {
      const goals = ctx.goals || [];
      const rows = goals.slice(0, 8).map((g) => {
        const pct = Number(g.target) > 0 ? Math.round((Number(g.current || 0) / Number(g.target)) * 100) : 0;
        return { Goal: g.name, Progress: aud(g.current || 0) + ' / ' + aud(g.target || 0), '%': pct + '%' };
      });
      return { type: 'table', data: { columns: ['Goal', 'Progress', '%'], rows } };
    },
  },
};

function isKnownSource(source) {
  return Object.prototype.hasOwnProperty.call(WIDGET_SOURCES, source);
}

// A concise instruction block appended to the advisor system prompt so the
// model knows how to request visuals + follow-ups. Kept short to save tokens.
function widgetInstructions() {
  const sources = Object.keys(WIDGET_SOURCES).join(', ');
  return [
    '',
    'GENERATIVE UI: when a chart or table would help, you MAY embed a request on its own line using a fenced block:',
    '```maal-widget {"source":"<source>","title":"<short title>"}```',
    'Valid sources (you may ONLY use these, and only when the user actually has that data): ' + sources + '.',
    'Do NOT put any numbers or data in the block — the app fills real figures from the user\'s account. Use at most 2 widgets per reply, and still explain the point in words.',
    'You may also suggest up to 3 short follow-up questions on their own line:',
    '```maal-followups ["question one","question two"]```',
    'These fenced blocks are stripped from your visible reply, so never rely on them for the actual answer.',
  ].join('\n');
}

const WIDGET_RE = /```maal-widget\s*([\s\S]*?)```/g;
const FOLLOWUPS_RE = /```maal-followups\s*([\s\S]*?)```/g;

// Parse the model's raw reply: pull out widget requests + follow-ups and strip
// the fenced blocks from the visible text. Returns { text, widgetRequests, followUps }.
function parseDirectives(raw) {
  const text = String(raw || '');
  const widgetRequests = [];
  let m;
  WIDGET_RE.lastIndex = 0;
  while ((m = WIDGET_RE.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && typeof obj.source === 'string') {
        widgetRequests.push({ source: obj.source, title: typeof obj.title === 'string' ? obj.title.slice(0, 80) : undefined });
      }
    } catch (e) { /* ignore malformed block */ }
  }
  let followUps = [];
  FOLLOWUPS_RE.lastIndex = 0;
  const fm = FOLLOWUPS_RE.exec(text);
  if (fm) {
    try {
      const arr = JSON.parse(fm[1].trim());
      if (Array.isArray(arr)) followUps = arr.filter((x) => typeof x === 'string').map((x) => x.slice(0, 120)).slice(0, 3);
    } catch (e) { /* ignore */ }
  }
  const clean = text.replace(WIDGET_RE, '').replace(FOLLOWUPS_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: clean, widgetRequests, followUps };
}

// Build renderable widgets from validated requests + the data context. Unknown
// sources and empty results are dropped. Returns [{ source, type, title, data }].
function buildWidgets(widgetRequests, ctx) {
  const out = [];
  const seen = new Set();
  for (const req of widgetRequests || []) {
    if (!isKnownSource(req.source) || seen.has(req.source)) continue;
    seen.add(req.source);
    const def = WIDGET_SOURCES[req.source];
    let spec;
    try { spec = def.compute(ctx); } catch (e) { continue; }
    if (!spec || !hasContent(spec)) continue; // don't render an empty chart
    out.push({ source: req.source, type: spec.type, title: req.title || def.defaultTitle, data: spec.data });
    if (out.length >= 2) break;
  }
  return out;
}

function hasContent(spec) {
  const d = spec.data || {};
  if (spec.type === 'donut') return Array.isArray(d.segments) && d.segments.length > 0;
  if (spec.type === 'line') return Array.isArray(d.points) && d.points.length >= 2;
  if (spec.type === 'table') return Array.isArray(d.rows) && d.rows.length > 0;
  if (spec.type === 'stat-cards') return Array.isArray(d.cards) && d.cards.length > 0;
  return false;
}

// Render a single saved widget live from its source (used by the dashboard).
// Returns { source, type, title, data } or null if the source is gone/empty.
function renderSaved(source, title, ctx) {
  if (!isKnownSource(source)) return null;
  const def = WIDGET_SOURCES[source];
  let spec;
  try { spec = def.compute(ctx); } catch (e) { return null; }
  if (!spec || !hasContent(spec)) return null;
  return { source, type: spec.type, title: title || def.defaultTitle, data: spec.data };
}

// Internal citations for a reply: the user's own app data the answer drew on.
// Derived from the widgets used + whether a Vault document grounded the answer.
// We deliberately do NOT cite external sources (web / RAG knowledge base).
function internalCitations(widgets, extra) {
  const cites = [];
  const seen = new Set();
  for (const w of widgets || []) {
    const label = WIDGET_SOURCES[w.source] && WIDGET_SOURCES[w.source].cite;
    if (label && !seen.has(label)) { seen.add(label); cites.push({ label }); }
  }
  if (extra && extra.isaacusGrounding && extra.isaacusGrounding.filename) {
    const label = 'Vault: ' + extra.isaacusGrounding.filename;
    if (!seen.has(label)) { seen.add(label); cites.push({ label }); }
  }
  return cites;
}

module.exports = {
  WIDGET_SOURCES,
  isKnownSource,
  widgetInstructions,
  parseDirectives,
  buildWidgets,
  renderSaved,
  internalCitations,
};
