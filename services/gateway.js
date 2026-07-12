'use strict';
// services/gateway.js
// Role-based multi-model gateway — the single entry point for LLM calls.
// Callers ask for a ROLE, never a provider (specs/silvia-parity-tier1-2.md,
// decisions 2–4):
//
//   reasoner — synthesis/drafting. Azure OpenAI (strong deployment when
//              LLM_MODEL_STRONG is set, else the base deployment), falling
//              back to any OpenAI-compatible provider (AI_* / Groq / DeepSeek).
//   cheap    — classification, extraction, titling, merging. Groq first,
//              then Azure's cheap deployment, then the compat chain.
//   verifier — verify-and-revise critique pass. Anthropic Claude only
//              (ANTHROPIC_API_KEY; model ANTHROPIC_MODEL || claude-sonnet-5).
//              No key → the verify pass is skipped, never an error.
//
// Graduation path: when GATEWAY_BASE_URL + GATEWAY_API_KEY are set (e.g. a
// self-hosted LiteLLM proxy), every role routes there instead, with
// per-role models via GATEWAY_MODEL_REASONER / _CHEAP / _VERIFIER
// (fallback GATEWAY_MODEL).

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

// Injectable fetch so deterministic tests can stub the network.
let doFetch = (...args) => fetch(...args);
function _setFetchForTests(fn) { doFetch = fn || ((...args) => fetch(...args)); }

// ─── Provider configs ─────────────────────────────────────────────────────────

// Azure OpenAI — classic *.openai.azure.com and Foundry v1 surfaces.
// tier: 'cheap' | 'strong' (strong falls back to the cheap deployment).
function azureConfig(tier) {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const apiKey = (process.env.AZURE_OPENAI_API_KEY || '').trim();
  const baseDeployment = (process.env.AZURE_OPENAI_DEPLOYMENT || '').trim();
  if (!endpoint || !apiKey || !baseDeployment) return null;

  const cheapDeployment = (process.env.LLM_MODEL_CHEAP || baseDeployment).trim();
  const strongDeployment = (process.env.LLM_MODEL_STRONG || cheapDeployment).trim();
  const deployment = tier === 'strong' ? strongDeployment : cheapDeployment;

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  const useV1 = endpoint.includes('services.ai.azure.com') || endpoint.endsWith('/openai/v1');
  const v1Base = endpoint.endsWith('/openai/v1') ? endpoint : (endpoint.replace(/\/openai$/, '') + '/openai/v1');
  const url = useV1
    ? (v1Base + '/chat/completions')
    : (endpoint + '/openai/deployments/' + deployment + '/chat/completions?api-version=' + apiVersion);

  return { kind: 'azure', url, apiKey, model: deployment, useV1, label: 'azure/' + deployment };
}

function groqConfig() {
  if (!process.env.GROQ_API_KEY) return null;
  const model = (process.env.LLM_MODEL_CHEAP_GROQ || 'llama-3.3-70b-versatile').trim();
  return { kind: 'openai', baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY, model, label: 'groq/' + model };
}

function customConfig() {
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
    const model = (process.env.AI_MODEL || 'llama-3.3-70b-versatile').trim();
    return { kind: 'openai', baseURL: process.env.AI_BASE_URL.replace(/\/+$/, ''), apiKey: process.env.AI_API_KEY, model, label: 'custom/' + model };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { kind: 'openai', baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, model: 'deepseek-chat', label: 'deepseek/deepseek-chat' };
  }
  return null;
}

function anthropicConfig() {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = (process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL).trim();
  return { kind: 'anthropic', apiKey, model, label: 'anthropic/' + model };
}

// Proxy mode. If GATEWAY_BASE_URL + GATEWAY_API_KEY are set, the proxy is the
// intended route for every role — we must NOT silently fall back to a direct
// provider (that would bypass the operator's routing/budgets). If the role has
// no model AND there is no GATEWAY_MODEL default, that is a misconfiguration:
// we return a config carrying an empty model so completeAs throws a clear
// error rather than quietly using Azure/Groq.
function gatewayProxyEnabled() {
  return !!((process.env.GATEWAY_BASE_URL || '').trim() && (process.env.GATEWAY_API_KEY || '').trim());
}
function gatewayOverride(role) {
  if (!gatewayProxyEnabled()) return null;
  const baseURL = process.env.GATEWAY_BASE_URL.trim().replace(/\/+$/, '');
  const apiKey = process.env.GATEWAY_API_KEY.trim();
  const model = (process.env['GATEWAY_MODEL_' + role.toUpperCase()] || process.env.GATEWAY_MODEL || '').trim();
  return { kind: 'openai', baseURL, apiKey, model, label: 'gateway/' + (model || '(no model configured)') };
}

// Ordered list of provider candidates for a role, best first. completeAs tries
// each in turn on retryable failures (see specs decision 2/3: fallback chains).
function resolveRoleCandidates(role) {
  if (gatewayProxyEnabled()) return [gatewayOverride(role)]; // proxy owns routing; no direct fallback
  if (role === 'verifier') return [anthropicConfig()].filter(Boolean);
  if (role === 'reasoner') return [azureConfig('strong'), customConfig(), groqConfig()].filter(Boolean);
  if (role === 'cheap') return [groqConfig(), azureConfig('cheap'), customConfig()].filter(Boolean);
  throw new Error('gateway: unknown role "' + role + '"');
}

// The primary provider for a role (or null). Kept for health checks + callers
// that only need to know a role is serviceable.
function resolveRole(role) {
  return resolveRoleCandidates(role)[0] || null;
}

function hasRole(role) { return !!resolveRole(role); }
function hasAnyProvider() { return hasRole('reasoner'); }

// ─── Transports ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = Number(process.env.GATEWAY_TIMEOUT_MS) || 60000;

// fetch with a bounded abort timeout, so a hung provider socket can never wedge
// a request forever (and lets completeAs move on to the next candidate).
async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    return await doFetch(url, Object.assign({}, init, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function azureComplete(cfg, messages, opts) {
  const body = { messages, max_tokens: opts.maxTokens, temperature: opts.temperature };
  if (cfg.useV1) body.model = cfg.model; // v1 routes by model name
  const res = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': cfg.apiKey },
    body: JSON.stringify(body),
  }, opts.timeoutMs);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Azure OpenAI ' + res.status + ' (' + cfg.label + '): ' + detail.slice(0, 200));
  }
  const json = await res.json();
  return (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
}

async function openaiCompatComplete(cfg, messages, opts) {
  if (!cfg.model) throw new Error('gateway proxy (GATEWAY_BASE_URL) is configured but no model is set for this role — set GATEWAY_MODEL or GATEWAY_MODEL_<ROLE>');
  const res = await fetchWithTimeout(cfg.baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify({ model: cfg.model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature }),
  }, opts.timeoutMs);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('LLM provider ' + res.status + ' (' + cfg.label + '): ' + detail.slice(0, 200));
  }
  const json = await res.json();
  return (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
}

async function anthropicComplete(cfg, messages, opts) {
  // Anthropic Messages API: system prompt is a top-level field.
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: String(m.content) }));
  if (!turns.length) turns.push({ role: 'user', content: '(no input)' });
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      ...(system ? { system } : {}),
      messages: turns,
    }),
  }, opts.timeoutMs);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Anthropic ' + res.status + ' (' + cfg.label + '): ' + detail.slice(0, 200));
  }
  const json = await res.json();
  // Pick the first `text` block — with extended thinking the first block can be
  // a `thinking` block, so content[0].text would be undefined.
  const blocks = Array.isArray(json.content) ? json.content : [];
  const textBlock = blocks.find(b => b && b.type === 'text' && typeof b.text === 'string');
  return (textBlock && textBlock.text) || '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

function runProvider(cfg, messages, o) {
  if (cfg.kind === 'azure') return azureComplete(cfg, messages, o);
  if (cfg.kind === 'anthropic') return anthropicComplete(cfg, messages, o);
  return openaiCompatComplete(cfg, messages, o);
}

// Complete `messages` using `role`. Tries each configured provider for the role
// in order, falling through to the next on failure (network error, timeout,
// 5xx). opts.timeoutMs (default DEFAULT_TIMEOUT_MS) is the TOTAL budget across
// ALL failover attempts — each attempt gets the time remaining until the shared
// deadline, so total latency stays bounded regardless of candidate count.
// Returns assistant text; throws the last error only if every candidate fails.
async function completeAs(role, messages, opts) {
  const candidates = resolveRoleCandidates(role);
  if (!candidates.length) throw new Error('gateway: no provider configured for role "' + role + '"');
  const totalBudget = (opts && opts.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + totalBudget;
  const base = {
    maxTokens: (opts && opts.maxTokens) || 600,
    temperature: opts && opts.temperature != null ? opts.temperature : 0.6,
  };
  let lastErr;
  for (let i = 0; i < candidates.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { lastErr = lastErr || new Error('gateway: overall timeout budget exhausted for role "' + role + '"'); break; }
    try {
      return await runProvider(candidates[i], messages, Object.assign({}, base, { timeoutMs: remaining }));
    } catch (e) {
      lastErr = e;
      if (i < candidates.length - 1) {
        console.warn('[gateway] ' + role + ' provider ' + candidates[i].label + ' failed (' + e.message + ') — trying ' + candidates[i + 1].label);
      }
    }
  }
  throw lastErr || new Error('gateway: all providers failed for role "' + role + '"');
}

const VERIFIER_SYSTEM = [
  'You are a strict fact-checker for an Australian financial education assistant.',
  'You are given grounding context (authoritative FY constants and the user\'s actual financial data) and a draft answer.',
  'Check ONLY these three things:',
  '1. Numeric/math consistency inside the draft (calculations, percentages, totals).',
  '2. Every Australian figure (tax brackets, SG rate, HECS thresholds, super caps, CGT discount, key dates) matches the AUTHORITATIVE constants in the grounding. The constants ALWAYS win over any other knowledge.',
  '3. Claims about the user\'s situation match the user data in the grounding.',
  'Do NOT comment on style, tone, structure, or completeness.',
  'Respond with ONLY a JSON object, no prose: {"pass": true} if the draft is correct, or {"pass": false, "issues": ["specific issue with the correct value", ...]} (max 5 issues).',
].join('\n');

// Verify a draft answer against its grounding; when issues are found, give the
// reasoner ONE revision round with the critique, then ship regardless.
// Never blocks on verifier failure — any error returns the original draft.
// Returns { text, verified, revised, issues }.
async function verifyAndRevise({ messages, draft, opts }) {
  const result = { text: draft, verified: false, revised: false, issues: [] };
  if (!hasRole('verifier')) {
    console.log('[gateway] verifier not configured (ANTHROPIC_API_KEY unset) — skipping verify pass');
    return result;
  }
  try {
    const grounding = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const raw = await completeAs('verifier', [
      { role: 'system', content: VERIFIER_SYSTEM },
      {
        role: 'user',
        content:
          '<grounding>\n' + grounding.slice(0, 24000) + '\n</grounding>\n\n' +
          '<question>\n' + String(lastUser ? lastUser.content : '').slice(0, 4000) + '\n</question>\n\n' +
          '<draft>\n' + String(draft).slice(0, 12000) + '\n</draft>',
      },
    ], { maxTokens: 500, temperature: 0 });

    const m = String(raw || '').match(/\{[\s\S]*\}/);
    const verdict = m ? JSON.parse(m[0]) : null;
    if (!verdict || typeof verdict.pass !== 'boolean') return result; // unparseable → ship draft
    result.verified = true;
    if (verdict.pass) return result;

    result.issues = Array.isArray(verdict.issues) ? verdict.issues.slice(0, 5).map(String) : [];
    if (!result.issues.length) return result;

    const revised = await completeAs('reasoner', [
      ...messages,
      { role: 'assistant', content: draft },
      {
        role: 'user',
        content:
          'A fact-checker reviewed your answer against the authoritative FY constants and my actual data, and found these specific issues:\n- ' +
          result.issues.join('\n- ') +
          '\n\nRewrite your answer correcting ONLY these issues. Keep everything else (length, tone, structure) the same. Reply with the corrected answer only — do not mention the review.',
      },
    ], opts || {});
    if (revised && revised.trim()) {
      result.text = revised;
      result.revised = true;
    }
  } catch (e) {
    console.error('[gateway] verify pass failed (shipping draft):', e.message);
  }
  return result;
}

module.exports = {
  completeAs,
  verifyAndRevise,
  hasRole,
  hasAnyProvider,
  resolveRole,
  resolveRoleCandidates,
  _setFetchForTests,
};
