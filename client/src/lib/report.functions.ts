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

export async function generateReport(data?: unknown): Promise<{ filename: string; base64: string }> {
  const r = await fetch('/api/v1/report', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  if (!r.ok) {
    let payload: Record<string, unknown> | undefined;
    try { payload = await r.json(); } catch { /* non-JSON */ }
    throw new FileGenError((payload?.error as string) || 'Could not generate report.', r.status, payload);
  }
  return r.json();
}

// Error carrying a 402 usage-limit payload so the UI can show an upgrade prompt.
export class FileGenError extends Error {
  status: number;
  code?: string;
  upgradeUrl?: string;
  constructor(message: string, status: number, payload?: Record<string, unknown>) {
    super(message);
    this.name = 'FileGenError';
    this.status = status;
    this.code = payload?.code as string | undefined;
    this.upgradeUrl = payload?.upgradeUrl as string | undefined;
  }
}

// Ask the server to generate a data file from the user's real data and email it
// (Pro/Max — metered as ai_files). Returns { emailedTo, filename }.
export async function emailDataFile(type: string, dataset: string): Promise<{ emailedTo: string; filename: string }> {
  const r = await fetch('/api/v1/files/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { type, dataset } }),
  });
  if (!r.ok) {
    let payload: Record<string, unknown> | undefined;
    try { payload = await r.json(); } catch { /* non-JSON */ }
    throw new FileGenError((payload?.error as string) || 'Could not generate the file.', r.status, payload);
  }
  return r.json();
}
