'use strict';

const { citation } = require('../lib/advisor-citations');
const research = require('./research');

// Explicit research commands have a separate quota. Resolve intent before
// opening an event stream so the client receives the usual HTTP 402 response.
function researchQuestion(message, history) {
  if (typeof message !== 'string') return null;
  const match = /^(?:\/research\b|(?:(?:can|could|would) you\s+|please\s+)?research(?:\s|[.!?:]|$))\s*[:–-]?\s*([\s\S]*)$/i.exec(message.trim());
  if (!match) return null;
  let question = match[1].trim();
  if (/^this(?: for me)?[.!?]*$/i.test(question)) {
    const previous = Array.isArray(history) ? history.slice(-10).reverse().find(turn =>
      turn?.role === 'user' && typeof turn.content === 'string' && turn.content.trim()) : undefined;
    question = previous?.content.trim() || '';
  }
  return question.replace(/^[.!?]+$/, '').slice(0, 600).trim();
}

async function runResearchTool({ user, profile, maal, question, signal, onStep, requireVerification }) {
  const { report, sources } = await research.runResearch(user, profile, maal, question, { signal, onStep, requireVerification });
  const citations = sources.map(source => citation({ label: source.title || source.source, url: source.url }))
    .filter(item => item?.url).slice(0, 10);
  return { reply: report, widgets: [], followUps: [], citations, live: true };
}

module.exports = { researchQuestion, runResearchTool };
