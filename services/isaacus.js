// services/isaacus.js
// Isaacus (isaacus.com) — Australian legal AI. NOT a chat/completion API like
// Azure/Groq: every call is extractive/classificatory over text you supply,
// there is no free-form "ask it anything about AU law" endpoint. Maal uses it
// to ground answers in the user's own Vault documents (leases, contracts,
// super statements), not to generate legal opinions from nothing.
//
// Auth: Authorization: Bearer <ISAACUS_API_KEY>
// Base: https://api.isaacus.com/v1

const ISAACUS_BASE = 'https://api.isaacus.com/v1';

function apiKey() {
  return (process.env.ISAACUS_API_KEY || '').trim();
}

function hasIsaacus() {
  return !!apiKey();
}

async function isaacusFetch(path, body) {
  const res = await fetch(ISAACUS_BASE + path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (e) { /* empty/non-JSON body */ }
  if (!res.ok) {
    const detail = (json && (json.detail || json.message)) || text.slice(0, 200);
    throw new Error(`Isaacus ${res.status} on ${path}: ${detail}`);
  }
  return json;
}

// Zero-shot classification: how well does `text` match the `query` statement?
// Returns a 0-1 score (higher = stronger match). No training examples needed —
// this is Isaacus's "universal classifier."
async function classify(query, text) {
  const json = await isaacusFetch('/classifications/universal', {
    model: 'kanon-universal-classifier',
    query,
    texts: [String(text || '').slice(0, 8000)],
  });
  const cls = json.classifications && json.classifications[0];
  return cls ? Number(cls.score) || 0 : 0;
}

// Kept short and declarative on purpose — the universal classifier scores
// semantic match against this statement, and a long instructive sentence
// (earlier version of this query) produced a weak legal-vs-non-legal spread
// in testing (~0.42 vs ~0.33, only 0.08 apart) compared to a plain statement.
const LEGAL_INTENT_QUERY = 'This message asks a legal, tax, tenancy, contract, or regulatory question.';

// Convenience: is this advisor message a legal/tax question worth grounding in
// a source document, rather than answering from the main LLM's general training?
async function classifyLegalIntent(message) {
  return classify(LEGAL_INTENT_QUERY, message);
}

// Extractive Q&A: pull the literal answer to `query` out of one or more
// `texts`. Returns the single best answer across all documents, or null if
// no document actually contains an answer (this must not be papered over
// with a guess).
//
// Isaacus returns two distinct signals per document, and they're not on the
// same scale — confirmed against a real API response before relying on this:
//   - extraction.inextractability_score: how confident Isaacus is that NO
//     answer exists in this document (near 0 = an answer is there).
//   - answers[].score: a relative ranking score for each candidate answer
//     within a document — NOT a 0-1 "confidence this is correct" value. A
//     verbatim-correct extraction scored 0.18 in testing, so gating on this
//     alone with a 0.2+ cutoff silently discarded a right answer. Gate on
//     inextractability_score instead; use answers[].score only to rank
//     candidates against each other once we know an answer exists.
async function extractAnswer(query, texts, { maxInextractability = 0.5 } = {}) {
  const inputs = (texts || []).filter(Boolean).map((t) => String(t).slice(0, 20000));
  if (!inputs.length) return null;

  const json = await isaacusFetch('/extractions/qa', {
    model: 'kanon-answer-extractor',
    query,
    texts: inputs,
  });

  let best = null;
  (json.extractions || []).forEach((extraction, sourceIndex) => {
    const inextractability = Number(extraction.inextractability_score);
    if (Number.isFinite(inextractability) && inextractability > maxInextractability) return;
    (extraction.answers || []).forEach((a) => {
      const score = Number(a.score) || 0;
      if (!best || score > best.score) {
        best = { text: a.text, score, sourceIndex };
      }
    });
  });

  return best;
}

module.exports = { hasIsaacus, classify, classifyLegalIntent, extractAnswer };
