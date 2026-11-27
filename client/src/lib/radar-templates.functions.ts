export async function listTemplates(): Promise<unknown[]> {
  const r = await fetch('/api/v1/radar-templates', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
