export async function listAlerts(): Promise<{ alerts: unknown[]; events: unknown[] }> {
  const r = await fetch('/api/v1/alerts', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  // Server returns { alerts, events } or [] stub — normalise both
  if (Array.isArray(j)) return { alerts: [], events: [] };
  return { alerts: j?.alerts ?? [], events: j?.events ?? [] };
}
export async function createAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) {
    // Surface the server's message (e.g. the usage-limit upgrade prompt) —
    // silently returning null made the page toast "Radar created" on failure.
    let msg = 'Could not create radar.';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}
export async function deleteAlert(data?: unknown): Promise<void> {
  const { id } = ((data as any)?.data ?? data ?? {}) as { id?: string };
  await fetch(`/api/v1/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
}
export async function toggleAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts/toggle', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) {
    let msg = 'Could not update radar.';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}
export async function evaluateAlerts(data?: unknown): Promise<{ fired: number }> {
  const r = await fetch('/api/v1/alerts/evaluate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : { fired: 0 };
}
