export async function listResearch(): Promise<unknown[]> {
  const r = await fetch('/api/v1/research', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function generateResearch(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/research/generate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function deleteResearch(data?: unknown): Promise<void> {
  const { id } = (data ?? {}) as { id?: string };
  await fetch(`/api/v1/research/${id}`, { method: 'DELETE', credentials: 'include' });
}
