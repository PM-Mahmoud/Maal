// lib/vault.functions.ts
// Real vault storage over /api/v1/vault (Postgres bytea). Replaces the previous
// Supabase Storage upload path (no such bucket exists in this backend).

export async function listVault(): Promise<unknown[]> {
  const r = await fetch('/api/v1/vault', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}

// Uploads the actual file bytes as multipart/form-data. The server stores the
// content as Postgres bytea and extracts readable text for the advisor.
export async function uploadVaultFile(file: File): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) {
    let msg = 'Upload failed';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

export async function deleteVaultDoc(payload?: { data?: { id?: string } }): Promise<void> {
  // Callers pass the Lovable-style { data: { id } } envelope — unwrap it.
  const id = payload?.data?.id;
  if (!id) return;
  await fetch(`/api/v1/vault/${id}`, { method: 'DELETE', credentials: 'include' });
}

export async function extractVaultDoc(payload?: { data?: { id?: string } }): Promise<unknown> {
  // Callers pass the Lovable-style { data: { id } } envelope — unwrap it.
  const id = payload?.data?.id;
  if (!id) return null;
  const r = await fetch(`/api/v1/vault/${id}/extract`, { method: 'POST', credentials: 'include' });
  return r.ok ? r.json() : null;
}
