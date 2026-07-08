// lib/report.functions.ts
// Report generation delegates to the server (POST /api/v1/report), so the AI
// runs behind Maal's advisor guardrails (education-only, Isaacus, RAG) with the
// key server-side.
//
// NOTE: a previous client-side action-plan generator that called the Lovable AI
// gateway (ai.gateway.lovable.dev) directly from the browser was removed. It was
// dead code (never invoked, and its key came from process.env, which is undefined
// in the Vite client), and calling an AI gateway from the client would bypass the
// server advisor's guardrails. Any AI-authored report content must go through the
// server advisor endpoint instead.

export async function generateReport(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/report', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  if (!r.ok) return null;
  return r.json();
}
