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

const EXA_TIMEOUT_MS = Number(process.env.EXA_TIMEOUT_MS) || 20000;

async function exaSearch(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXA_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(EXA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY.trim() },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: 4,
        includeDomains: ['ato.gov.au'],
        contents: { highlights: true, maxAgeHours: 24 * 7 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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
  let failures = 0; // topics that could not be fully checked (Exa/model/parse errors, no sources)

  for (const topic of TOPICS) {
    let sources;
    try {
      sources = await exaSearch(topic.query);
    } catch (e) {
      topics.push({ id: topic.id, status: 'error', error: e.message });
      failures++;
      continue;
    }
    if (!sources.length) {
      topics.push({ id: topic.id, status: 'no_sources', sources: 0 });
      failures++;
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
      topics.push({ id: topic.id, status: 'model_error', sources: sources.length, error: e.message });
      failures++;
      continue;
    }
    // A failed parse is INCONCLUSIVE, not clean — the model may have flagged a
    // real drift we simply couldn't read. Never silently pass it.
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    let parsed = null;
    if (m) { try { parsed = JSON.parse(m[0]); } catch (e) { parsed = null; } }
    if (!parsed || !Array.isArray(parsed.discrepancies)) {
      topics.push({ id: topic.id, status: 'unparseable', sources: sources.length });
      failures++;
      continue;
    }
    const found = parsed.discrepancies;
    topics.push({ id: topic.id, status: 'checked', sources: sources.length, discrepancies: found.length });
    found.slice(0, 5).forEach(d => discrepancies.push(Object.assign({ topic: topic.id }, d)));
  }

  // Only 'clean' when every topic was checked and parsed with no discrepancies.
  const status = discrepancies.length ? 'discrepancies' : (failures ? 'inconclusive' : 'clean');
  const report = { fy, checkedAt: new Date().toISOString(), status, failures, topics, discrepancies };
  if (status === 'discrepancies') {
    console.warn('[constants-audit] ' + discrepancies.length + ' potential drift(s) found — human review needed:', JSON.stringify(discrepancies));
  } else if (status === 'inconclusive') {
    console.warn('[constants-audit] INCONCLUSIVE — ' + failures + ' of ' + TOPICS.length + ' topics could not be fully checked (see topics[].status); not asserting clean for FY' + fy);
  } else {
    console.log('[constants-audit] clean — constants match official sources for FY' + fy);
  }
  return report;
}

module.exports = { runDriftCheck, hasExa };
