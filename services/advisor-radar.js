'use strict';

const gateway = require('./gateway');
const radarDb = require('../db/radar');
const { extractSymbols } = require('./radar');

const CREATE_WATCH = 'create_radar_watch';
const WATCH_ACTIVE = 'Your watch is active. You can see alerts and manage it under Radar watches in the Advisor.';
const tools = [{
  name: CREATE_WATCH,
  description: 'Start an in-app watch for the financial event or condition the user explicitly asks to monitor.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
}];

function watchPrompt(message) {
  if (typeof message !== 'string') return null;
  const text = message.trim().replace(/^(?:(?:can|could|would) you\s+|please\s+)/i, '');
  const match = /^(?:\/watch\b\s*[:–-]?\s*([\s\S]*)|watch\s+for\s+([\s\S]+)|watch\s+([\s\S]+?)\s+for me)[.!?]*$/i.exec(text);
  if (!match) return null;
  const prompt = (match[1] ?? match[2] ?? match[3] ?? '').trim().replace(/[.!?]+$/, '').trim();
  if (/^(?:this|that|it)$/i.test(prompt) || prompt.length > 600) return '';
  return prompt;
}

async function runWatchTool({ userId, prompt, limit, signal }) {
  if (limit <= 0) return { limited: true };
  const active = (await radarDb.listRadars(userId)).filter(watch => watch.active);
  signal?.throwIfAborted();
  if (active.some(watch => watch.prompt.toLowerCase() === prompt.toLowerCase())) return { reply: WATCH_ACTIVE };
  if (active.length >= limit) return { limited: true };
  const response = await gateway.completeAs('reasoner', [
    { role: 'system', content: 'Call create_radar_watch only for a clear request to monitor a financial condition. If the condition is unclear or outside finance, do not call a tool.' },
    { role: 'user', content: prompt },
  ], { tools, maxTokens: 180, temperature: 0, timeoutMs: 10000, signal });
  signal?.throwIfAborted();

  const calls = response?.toolCalls || [];
  const call = calls.length === 1 && calls[0]?.type === 'function' ? calls[0].function : null;
  let authorized = false;
  if (call?.name === CREATE_WATCH && typeof call.arguments === 'string' && call.arguments.length < 100) {
    try {
      const args = JSON.parse(call.arguments);
      authorized = args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0;
    }
    catch { /* Invalid arguments have no effect. */ }
  }
  if (!authorized) return { reply: 'Tell me the financial event or condition you’d like to watch, such as the next RBA rate decision.' };

  const id = await radarDb.createRadarIfUnderActiveLimit(userId, {
    prompt,
    symbols: extractSymbols(prompt),
    frequency: 'daily',
    notifyEmail: false,
    notifySms: false,
  }, limit, { reuseActivePrompt: true });
  if (id === null) return { limited: true };
  return { reply: WATCH_ACTIVE };
}

module.exports = { watchPrompt, runWatchTool };
