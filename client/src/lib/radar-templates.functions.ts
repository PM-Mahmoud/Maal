export async function listTemplates(): Promise<unknown[]> {
  const r = await fetch('/api/v1/radar-templates', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function upsertTemplate(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/radar-templates', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function listVersions(data?: unknown): Promise<{ versions: unknown[] }> {
  const r = await fetch('/api/v1/radar-template-versions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const j = r.ok ? await r.json() : null;
  return { versions: Array.isArray(j?.versions) ? j.versions : [] };
}
export async function revertToVersion(data?: unknown): Promise<unknown> { return null; }
export async function resetTemplate(data?: unknown): Promise<unknown> { return null; }
