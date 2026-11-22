'use strict';
// lib/budget-wording.js — the ONLY part of "Create a budget with Maal"
// (HEL-86) a model touches: a short plain-English explanation of a budget that
// shared/spending-breakdown.mjs suggestBudget() has already worked out. Pure:
// builds the prompt and checks the reply. The reply is dropped sentence by
// sentence if it mentions any number that isn't one of the computed figures,
// so the model can never introduce a figure of its own.
// Covered by test/spending-breakdown.test.js.

const MAX_SUMMARY = 420;
const MAX_POINT = 200;

const aud = (n) => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;

/** The figures the model is given, already formatted. No names, merchants or account details. */
function factsForPrompt(s) {
  const lines = [
    `Months reviewed: ${s.monthsUsed}`,
    `Average monthly income: ${aud(s.avgIncome)}`,
    `Average monthly spending: ${aud(s.avgExpenses)}`,
    `Average monthly ${s.avgSavings < 0 ? 'shortfall' : 'saving'}: ${aud(s.avgSavings)}`,
    `Suggested monthly budget: ${aud(s.suggested)} (range ${aud(s.range.min)} to ${aud(s.range.max)})`,
    'How it was set: start from average spending; aim to spend no more than 80% of income, but never cut more than 15% below typical spending in one step; with no income recorded, trim typical spending by 15%.',
  ];
  for (const f of s.facts || []) {
    if (f.id === 'top_category') lines.push(`Biggest category: ${f.category}, ${aud(f.average)} a month (${Math.round(f.share)}% of spending)`);
    if (f.id === 'uncategorised') lines.push(`Uncategorised ("Other") spending: ${aud(f.average)} a month (${Math.round(f.share)}%)`);
    if (f.id === 'negative_cash_flow') lines.push(`Months where spending was more than income: ${f.negativeMonths} of ${f.months}`);
    if (f.id === 'no_income') lines.push('No income was recorded in these months.');
    if (f.id === 'saving') lines.push(`Savings rate: ${Math.round(f.rate)}% of income`);
  }
  for (const c of s.categories || []) lines.push(`Suggested category budget: ${c.group} ${aud(c.budget)} (usually ${aud(c.average)})`);
  return lines.join('\n');
}

function buildMessages(s) {
  return [
    {
      role: 'system',
      content: [
        'You explain a monthly budget to an Australian user of a money app, in Australian English.',
        'The budget has already been calculated. Use ONLY the figures given. Never calculate, estimate or invent any other number, percentage or date.',
        'Be warm, plain and brief. Educational only: no financial advice, no product names, no instructions to buy or sell anything.',
        'Reply with ONLY a JSON object: {"summary": "<2 sentences on what the pattern means>", "why": ["<point>", "<point>", "<point>"]}.',
        '"why" explains why the suggested budget is a sensible step, max 3 points, each one sentence.',
      ].join('\n'),
    },
    { role: 'user', content: factsForPrompt(s) },
  ];
}

/** Numbers mentioned in text: "$1,250.50" → 1250.5, "20%" → 20. */
function numbersIn(text) {
  return (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((m) => Number(m.replace(/,/g, '')));
}

/** Keep a sentence only if every number in it is one of the allowed figures. */
function vetSentence(sentence, allowed) {
  const ok = new Set((allowed || []).map((n) => Math.round(Number(n) * 100) / 100));
  return numbersIn(sentence).every((n) => ok.has(Math.round(n * 100) / 100));
}

function vetText(text, allowed, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const kept = sentences.map((x) => x.trim()).filter((x) => x && vetSentence(x, allowed)).join(' ');
  return kept.length > max ? `${kept.slice(0, max - 1).trimEnd()}…` : kept;
}

/**
 * Parse + vet a model reply. Returns { summary, why[] } with every unvetted
 * sentence removed, or null when nothing usable is left.
 */
function parseWording(raw, allowed) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const summary = vetText(j.summary, allowed, MAX_SUMMARY);
  const why = (Array.isArray(j.why) ? j.why : [])
    .slice(0, 3)
    .map((p) => vetText(p, allowed, MAX_POINT))
    .filter(Boolean);
  if (!summary && !why.length) return null;
  return { summary, why };
}

module.exports = { buildMessages, factsForPrompt, numbersIn, vetSentence, parseWording };
