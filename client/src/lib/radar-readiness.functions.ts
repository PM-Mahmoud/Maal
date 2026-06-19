export async function getRadarReadiness(): Promise<{ score: number; missing: unknown[]; ready: boolean } | null> {
  const r = await fetch('/api/v1/radar/readiness', { credentials: 'include' });
  if (!r.ok) return null;
  const j = await r.json();
  // Stub returns [] — treat as null (no readiness data)
  if (Array.isArray(j)) return null;
  return j ?? null;
}
