// lib/research.functions.ts
// Real research over /api/v1/research. Callers pass a Lovable-style
// { data: {...} } envelope, so unwrap it here before hitting the API.

export async function listResearch(): Promise<unknown[]> {
  const r = await fetch('/api/v1/research', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}

export async function generateResearch(payload?: { data?: { topic?: string } }): Promise<unknown> {
  const topic = payload?.data?.topic ?? '';
  const r = await fetch('/api/v1/research/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  if (!r.ok) {
    let msg = 'Research failed';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

export async function deleteResearch(payload?: { data?: { id?: string } }): Promise<void> {
  const id = payload?.data?.id;
  if (!id) return;
  await fetch(`/api/v1/research/${id}`, { method: 'DELETE', credentials: 'include' });
}
