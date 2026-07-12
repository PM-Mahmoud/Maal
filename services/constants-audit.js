'use strict';
// services/constants-audit.js
// Monthly drift-check for lib/au-constants.js (specs/silvia-parity-tier1-2.md,
// decision 12): searches official sources (ato.gov.au via Exa) for the key
// figures and has the cheap model compare them against the constants in force.
// PROPOSE-ONLY — it reports discrepancies for a human to confirm; it never
// changes a constant. Wire an external cron to:
//   GET /internal/constants/drift?token=<RADAR_CRON_SECRET>
// Degrades gracefully: no EXA_API_KEY or no cheap model → { skipped: reason }.

const gateway = require('./gateway');
const { buildConstantsPrompt, getConstants } = require('../lib/au-constants');

const EXA_URL = 'https://api.exa.ai/search';

const TOPICS = [
  { id: 'income-tax', query: 'individual income tax rates and brackets for Australian residents current financial year' },
  { id: 'hecs', query: 'study and training support loans HELP compulsory repayment threshold and rates current financial year' },
  { id: 'super-caps', query: 'superannuation concessional and non-concessional contributions caps current financial year' },
  { id: 'mls', query: 'Medicare levy surcharge income thresholds and rates current financial year' },
];

function hasExa() {
  return !!(process.env.EXA_API_KEY || '').trim();
}

async function exaSearch(query) {
  const res = await fetch(EXA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY.trim() },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: 4,
      includeDomains: ['ato.gov.au'],
      contents: { highlights: true, maxAgeHours: 24 * 7 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Exa ' + res.status + ': ' + detail.slice(0, 200));
  }
  const json = await res.json();
  return (json.results || []).map(r => ({
    title: r.title,
    url: r.url,
    highlights: (r.highlights || []).join(' … '),
  }));
}

// Run the drift check. Returns { fy, checkedAt, topics: [...], discrepancies: [...] }
// or { skipped: reason } when a dependency is missing.
async function runDriftCheck() {
  if (!hasExa()) return { skipped: 'EXA_API_KEY not configured' };
  if (!gateway.hasRole('cheap')) return { skipped: 'no cheap-role model configured' };

  const constants = buildConstantsPrompt();
  const fy = getConstants().fy;
  const topics = [];
  const discrepancies = [];

  for (const topic of TOPICS) {
    let sources;
    try {
      sources = await exaSearch(topic.query);
    } catch (e) {
      topics.push({ id: topic.id, error: e.message });
      continue;
    }
    if (!sources.length) {
      topics.push({ id: topic.id, sources: 0 });
      continue;
    }
    const evidence = sources
      .map(s => '<source url="' + s.url + '">\n' + String(s.highlights).slice(0, 1500) + '\n</source>')
      .join('\n');
    let raw = '';
    try {
      raw = await gateway.completeAs('cheap', [
        {
          role: 'system',
          content:
            'You compare an app\'s stored Australian financial constants against excerpts from official ATO pages. ' +
            'Report ONLY concrete numeric contradictions (a rate, threshold, or cap in the excerpts that clearly conflicts with the stored constants). ' +
            'Ignore anything the excerpts do not clearly state, proposed/unenacted changes, and different-financial-year figures. ' +
            'Respond with ONLY JSON: {"discrepancies": [{"stored": "...", "found": "...", "source": "url"}]} — empty array if none.',
        },
        {
          role: 'user',
          content: '<stored_constants>\n' + constants + '\n</stored_constants>\n\n<official_excerpts>\n' + evidence + '\n</official_excerpts>',
        },
      ], { maxTokens: 500, temperature: 0 });
    } catch (e) {
      topics.push({ id: topic.id, sources: sources.length, error: e.message });
      continue;
    }
    let found = [];
    try {
      const m = String(raw || '').match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : {};
      found = Array.isArray(parsed.discrepancies) ? parsed.discrepancies : [];
    } catch (e) { /* unparseable → treat as clean */ }
    topics.push({ id: topic.id, sources: sources.length, discrepancies: found.length });
    found.slice(0, 5).forEach(d => discrepancies.push(Object.assign({ topic: topic.id }, d)));
  }

  const report = { fy, checkedAt: new Date().toISOString(), topics, discrepancies };
  if (discrepancies.length) {
    console.warn('[constants-audit] ' + discrepancies.length + ' potential drift(s) found — human review needed:', JSON.stringify(discrepancies));
  } else {
    console.log('[constants-audit] clean — constants match official sources for FY' + fy);
  }
  return report;
}

module.exports = { runDriftCheck, hasExa };
