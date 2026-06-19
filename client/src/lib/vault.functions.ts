export async function listVault(): Promise<unknown[]> {
  const r = await fetch('/api/v1/vault', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function registerVaultDoc(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function deleteVaultDoc(data?: unknown): Promise<void> {
  const { id } = (data ?? {}) as { id?: string };
  await fetch(`/api/v1/vault/${id}`, { method: 'DELETE', credentials: 'include' });
}
export async function extractVaultDoc(data?: unknown): Promise<unknown> { return null; }
