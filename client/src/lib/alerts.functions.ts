// Error that carries the server's structured payload (e.g. a 402 usage-limit
// response with code/upgradeUrl) so callers can route the user to billing,
// while `message` stays the human-readable upgrade prompt for a toast.
export class ApiError extends Error {
  status: number;
  code?: string;
  upgrade?: boolean;
  upgradeUrl?: string;
  constructor(message: string, status: number, payload?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code as string | undefined;
    this.upgrade = payload?.upgrade as boolean | undefined;
    this.upgradeUrl = payload?.upgradeUrl as string | undefined;
  }
}

async function throwApiError(r: Response, fallback: string): Promise<never> {
  let payload: Record<string, unknown> | undefined;
  try { payload = await r.json(); } catch { /* non-JSON body */ }
  throw new ApiError((payload?.error as string) || fallback, r.status, payload);
}

export async function listAlerts(): Promise<{ alerts: unknown[]; events: unknown[] }> {
  const r = await fetch('/api/v1/alerts', { credentials: 'include' });
  // Throw (not silent empty state) so the page can't render "no radars yet"
  // when the request actually failed.
  if (!r.ok) return throwApiError(r, 'Could not load radars.');
  const j = await r.json();
  // Server returns { alerts, events }; a bare array IS the alert list (older/
  // stub shape) — keep it instead of dropping it to an empty list.
  if (Array.isArray(j)) return { alerts: j, events: [] };
  return { alerts: j?.alerts ?? [], events: j?.events ?? [] };
}
export async function createAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  // Throw (not silent null) so the page can't toast "Radar created" on failure,
  // and preserve the 402 usage-limit payload (code/upgradeUrl) for a billing CTA.
  if (!r.ok) return throwApiError(r, 'Could not create radar.');
  return r.json();
}
export async function deleteAlert(data?: unknown): Promise<void> {
  const { id } = ((data as any)?.data ?? data ?? {}) as { id?: string };
  const r = await fetch(`/api/v1/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) return throwApiError(r, 'Could not delete radar.');
}
export async function toggleAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts/toggle', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) return throwApiError(r, 'Could not update radar.');
  return r.json();
}
export async function evaluateAlerts(data?: unknown): Promise<{ fired: number }> {
  const r = await fetch('/api/v1/alerts/evaluate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  // Throw (not {fired: 0}) so "No conditions met" only shows for a genuine
  // successful evaluation with zero fires, never for a failed request.
  if (!r.ok) return throwApiError(r, 'Could not run radar evaluation.');
  return r.json();
}
