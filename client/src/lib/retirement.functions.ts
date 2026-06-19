export async function listScenarios(): Promise<unknown[]> {
  const r = await fetch('/api/v1/retirement/scenarios', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function saveScenario(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/retirement/scenarios', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function deleteScenario(data?: unknown): Promise<void> {
  const { id } = (data ?? {}) as { id?: string };
  await fetch(`/api/v1/retirement/scenarios/${id}`, { method: 'DELETE', credentials: 'include' });
}
