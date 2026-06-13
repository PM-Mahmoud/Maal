// services/advisor.js
// The Mizan advisor brain — chat completions via any OpenAI-compatible API.
//
// DEFAULT PROVIDER: Groq (https://groq.com) — a US company running open-weight
// models (Meta's Llama) on US servers. No data routed to China, which keeps
// things simple for Australian privacy/regulatory peace of mind (Privacy Act
// APP 8 cross-border disclosure is much easier to reason about with US/EU
// processors). Very cheap (~US$0.59/M input tokens for Llama 3.3 70B) and has
// a free tier for testing.
//
// HOW TO SET UP (~2 minutes):
//   1. Sign up at https://console.groq.com (free)
//   2. Create an API key
//   3. On Render: Environment → add GROQ_API_KEY = <key>
//   4. Redeploy. Ask Mizan and the chat widget now answer for real.
//
// SWAPPING PROVIDERS (no code change needed) — set all three env vars:
//   AI_API_KEY, AI_BASE_URL, AI_MODEL
// Examples:
//   Together AI: AI_BASE_URL=https://api.together.xyz/v1   AI_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
//   Fireworks:   AI_BASE_URL=https://api.fireworks.ai/inference/v1
//   Mistral(EU): AI_BASE_URL=https://api.mistral.ai/v1     AI_MODEL=mistral-small-latest
//   DeepSeek:    AI_BASE_URL=https://api.deepseek.com      AI_MODEL=deepseek-chat
//   HuggingFace: AI_BASE_URL=https://router.huggingface.co/v1
//                AI_MODEL=meta-llama/Llama-3.3-70B-Instruct  (HF routes to
//                partner providers at pass-through prices; pin your allowed
//                providers in HF settings if data routing matters to you)
//   (DEEPSEEK_API_KEY alone also still works, for backwards compatibility.)
// For full Australian data residency later: AWS Bedrock in ap-southeast-2
// (Sydney) hosts Llama/Mistral onshore — bigger setup, revisit when it matters.

const OpenAI = require('openai');

function providerConfig() {
  // 1. Fully custom provider
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
    return {
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
      model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  // 2. Groq (recommended default — US servers, open models, free tier)
  if (process.env.GROQ_API_KEY) {
    return {
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  // 3. DeepSeek (backwards compatibility)
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    };
  }
  return null;
}

function hasAdvisor() {
  return !!providerConfig();
}

function getClient() {
  const cfg = providerConfig();
  return { client: new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey }), model: cfg.model };
}

function aud(n) {
  n = Number(n) || 0;
  return '$' + n.toLocaleString('en-AU', { maximumFractionDigits: 0 });
}

function buildSystemPrompt(user, profile, mizan) {
  const p = profile || {};
  const lines = [
    'You are Mizan, a warm, sharp CFO-level financial advisor inside the Mizan app — the all-in-one for ethical investing, built for Australians.',
    'You provide EDUCATION ONLY, never personal financial advice. Do not tell the user what to do with their money; explain concepts, trade-offs and how things work so they can decide. Where relevant, gently remind them big decisions deserve their own research or a licensed adviser.',
    'You know Australian finance natively: superannuation (SG 12%), HECS-HELP (income-contingent, indexed 1 June), franking credits, EOFY (30 June), ATO, Medicare levy surcharge, CGT discount, ASX.',
    'Keep answers concise: 2-4 short paragraphs max, plain language, no bullet-point walls. Use AUD.',
    '',
    `The user's name is ${user && user.name ? user.name.split(' ')[0] : 'there'}.`,
  ];
  if (p.annual_income || p.super_balance || p.investment_portfolio || p.hecs_balance || p.total_debt) {
    lines.push('Their current financial snapshot (from their profile — use it to ground your answers):');
    if (p.profession) lines.push(`- Profession: ${p.profession}${p.years_in_practice ? ', ' + p.years_in_practice + ' years in practice' : ''}`);
    if (p.annual_income) lines.push(`- Annual gross income: ${aud(p.annual_income)}`);
    if (p.super_balance) lines.push(`- Super balance: ${aud(p.super_balance)}`);
    if (p.investment_portfolio) lines.push(`- Investments (non-super): ${aud(p.investment_portfolio)}`);
    if (p.property_value) lines.push(`- Property value: ${aud(p.property_value)}`);
    if (p.hecs_balance) lines.push(`- HECS-HELP balance: ${aud(p.hecs_balance)}`);
    if (p.total_debt) lines.push(`- Other debt: ${aud(p.total_debt)}`);
    if (p.prefers_halal) lines.push('- Prefers halal-compliant investing (no riba/interest-based products, no prohibited sectors)');
    if (p.prefers_esg) lines.push('- Prefers ESG/ethical investing');
  } else {
    lines.push('They have not added financial data yet — answer generally and suggest adding assets & liabilities in the app for personalised education.');
  }
  // Soft personalisation fields from the Profile page (onboarding_data JSONB)
  const od = (p && p.onboarding_data) || {};
  if (od.tax_residency || od.state) lines.push(`- Tax: ${[od.tax_residency, od.state].filter(Boolean).join(', ')}`);
  if (od.risk_tolerance) lines.push(`- Risk tolerance: ${od.risk_tolerance}${od.experience ? ', ' + od.experience + ' investor' : ''}`);
  if (od.super_option) lines.push(`- Super invested in: ${od.super_option}`);
  if (od.preferences) {
    lines.push('');
    lines.push(`The user set these preferences for how you should respond — honour them: "${String(od.preferences).slice(0, 600)}"`);
  }
  if (mizan && mizan.hasData) {
    lines.push(`Their Mizan Score (composite financial wellbeing, 0-100) is ${mizan.score} (${mizan.band}). Pillars: ` +
      mizan.pillars.map((pl) => `${pl.label} ${pl.score}/100`).join(', ') + '.');
  }
  return lines.join('\n');
}

const FALLBACK_REPLY =
  "I'm not fully switched on yet — the team hasn't connected my brain (an AI API key) in this environment. " +
  'Once a GROQ_API_KEY is added on the server, I can answer this properly using your real data. ' +
  'In the meantime, try adding your assets and liabilities so your dashboard and Mizan Score stay accurate.';

/**
 * @returns {Promise<string>} the assistant's reply
 */
async function chat(user, profile, mizan, messages) {
  if (!hasAdvisor()) return FALLBACK_REPLY;
  const { client, model } = getClient();
  const completion = await client.chat.completions.create({
    model: model,
    max_tokens: 600,
    temperature: 0.6,
    messages: [
      { role: 'system', content: buildSystemPrompt(user, profile, mizan) },
      ...messages.slice(-10), // keep context small + cheap
    ],
  });
  return completion.choices[0].message.content;
}

module.exports = { hasAdvisor, chat };
