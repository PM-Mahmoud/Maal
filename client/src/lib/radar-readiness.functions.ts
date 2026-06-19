

export type MissingInput = {
  key: string;
  label: string;
  why: string;
  href: string;
};

export async function getRadarReadiness(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/radar-readiness', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
