// services/advisor.js
// The Mizan advisor brain — chat completions via DeepSeek (OpenAI-compatible).
//
// HOW TO SET UP (~2 minutes, very cheap):
//   1. Sign up at https://platform.deepseek.com
//   2. Top up a small amount (a few dollars goes a long way — input is
//      ~US$0.27 per million tokens)
//   3. Create an API key
//   4. On Render: Environment → add DEEPSEEK_API_KEY = <key>
//   5. Redeploy. Ask Mizan and the chat widget now answer for real.
//
// Swapping models later: change baseURL + model below (the OpenAI SDK works
// with OpenAI, DeepSeek, Together, Groq, etc. — they share the same API shape).

const OpenAI = require('openai');

function hasAdvisor() {
  return !!process.env.DEEPSEEK_API_KEY;
}

function getClient() {
  return new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });
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
  if (mizan && mizan.hasData) {
    lines.push(`Their Mizan Score (composite financial wellbeing, 0-100) is ${mizan.score} (${mizan.band}). Pillars: ` +
      mizan.pillars.map((pl) => `${pl.label} ${pl.score}/100`).join(', ') + '.');
  }
  return lines.join('\n');
}

const FALLBACK_REPLY =
  "I'm not fully switched on yet — the team hasn't connected my brain (an AI API key) in this environment. " +
  'Once a DEEPSEEK_API_KEY is added on the server, I can answer this properly using your real data. ' +
  'In the meantime, try adding your assets and liabilities so your dashboard and Mizan Score stay accurate.';

/**
 * @returns {Promise<string>} the assistant's reply
 */
async function chat(user, profile, mizan, messages) {
  if (!hasAdvisor()) return FALLBACK_REPLY;
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: 'deepseek-chat',
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
