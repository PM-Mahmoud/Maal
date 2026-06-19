export async function listAlerts(): Promise<unknown[]> {
  const r = await fetch('/api/v1/alerts', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function createAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function deleteAlert(data?: unknown): Promise<void> {
  const { id } = (data ?? {}) as { id?: string };
  await fetch(`/api/v1/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
}
export async function toggleAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts/toggle', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function evaluateAlerts(): Promise<unknown> { return null; }
