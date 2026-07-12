'use strict';
// services/advisor-memory.js
// Synthesizes a cross-session memory document for a user from their advisor
// conversations (specs/silvia-parity-tier1-2.md, decision 6).
//
// Runs on the CHEAP role, on a DEFERRED debounce (never per turn). Rules:
//   - Store durable CONTEXT the DB doesn't hold: goals discussed, preferences,
//     standing requests, life events. NOT live figures — those come from the
//     user's account data at answer time.
//   - Never store account numbers or raw balances (a redaction guard strips
//     anything that slips through).
// The user can inspect ("what do you remember about me?"), edit, and clear it.

const gateway = require('./gateway');

const MEMORY_SECTIONS = ['Personal context', 'Financial situation', 'Preferences & instructions', 'Notable past discussions'];

// Only merge at most this often per user (debounce) — memory changes slowly and
// each merge is a model call.
const MERGE_DEBOUNCE_MS = Number(process.env.MEMORY_MERGE_DEBOUNCE_MS) || 10 * 60 * 1000;

function shouldMerge(lastMergedAt) {
  if (!lastMergedAt) return true;
  return Date.now() - new Date(lastMergedAt).getTime() >= MERGE_DEBOUNCE_MS;
}

// Redact things that must never live in memory: long digit runs (account/card
// numbers), explicit $ balances, BSBs. Belt-and-suspenders over the prompt rule.
function redactSensitive(text) {
  return String(text || '')
    .replace(/\b\d[\d\s-]{7,}\d\b/g, '[redacted]')      // 9+ digit runs (acct/card)
    .replace(/\b\d{3}-?\d{3}\b/g, '[redacted]')          // BSB-like
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, '[amount]');     // dollar amounts
}

const MERGE_SYSTEM = [
  'You maintain a compact long-term memory about a user of an Australian finance app, to help their advisor remember context across chats.',
  'You are given the EXISTING memory and a NEW conversation excerpt. Return the UPDATED memory as markdown with exactly these sections (omit a section only if truly empty):',
  MEMORY_SECTIONS.map((s) => '## ' + s).join('\n'),
  'Rules:',
  '- Keep it under 250 words. Merge new facts in; drop things that were corrected or are no longer true.',
  '- Record durable context: goals, plans, life events, preferences, standing instructions ("always show the math").',
  '- NEVER record account numbers, card numbers, BSBs, or specific dollar balances — those live in the app, not here.',
  '- Write terse bullet points, third person ("Prefers…", "Planning to…"). No preamble, output only the markdown.',
].join('\n');

// Merge existing memory + a new transcript into an updated memory doc. Returns
// the new markdown (redacted), or null if the model is unavailable / errored.
async function mergeMemory(existing, transcript) {
  if (!gateway.hasRole('cheap')) return null;
  const convo = String(transcript || '').slice(0, 6000);
  if (!convo.trim()) return null;
  let raw;
  try {
    raw = await gateway.completeAs('cheap', [
      { role: 'system', content: MERGE_SYSTEM },
      { role: 'user', content: '<existing_memory>\n' + String(existing || '(empty)').slice(0, 4000) + '\n</existing_memory>\n\n<new_conversation>\n' + convo + '\n</new_conversation>' },
    ], { maxTokens: 500, temperature: 0.2 });
  } catch (e) {
    console.error('[advisor-memory] merge failed:', e.message);
    return null;
  }
  const cleaned = redactSensitive(String(raw || '').trim());
  return cleaned.slice(0, 6000);
}

// Format a transcript (array of {role, content}) for the merge input.
function transcriptFromMessages(messages) {
  return (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => (m.role === 'user' ? 'User: ' : 'Maal: ') + String(m.content))
    .join('\n');
}

module.exports = { mergeMemory, shouldMerge, redactSensitive, transcriptFromMessages, MEMORY_SECTIONS };
