// lib/vault.functions.ts
// Real vault storage over /api/v1/vault (Postgres bytea). Replaces the previous
// Supabase Storage upload path (no such bucket exists in this backend).

// Reads the server's error body (when present) into an Error so callers can
// surface real failures instead of silently treating them as empty results.
// Auth failures get an explicit session message unless the server supplied one.
async function readError(r: Response, fallback: string): Promise<Error> {
  let msg = fallback;
  if (r.status === 401 || r.status === 403) msg = "Your session has expired — sign in again.";
  try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch { /* body wasn't JSON */ }
  return new Error(msg);
}

export async function listVault(): Promise<unknown[]> {
  const r = await fetch('/api/v1/vault', { credentials: 'include' });
  if (!r.ok) throw await readError(r, "Couldn't load your documents");
  const j = await r.json().catch(() => null);
  return Array.isArray(j) ? j : [];
}

// Uploads the actual file bytes as multipart/form-data. The server stores the
// content as Postgres bytea and extracts readable text for the advisor.
export async function uploadVaultFile(file: File): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) throw await readError(r, 'Upload failed');
  return r.json().catch(() => null);
}

export async function deleteVaultDoc(payload?: { data?: { id?: string; storage_path?: string } }): Promise<void> {
  // Callers pass the Lovable-style { data: { id, storage_path } } envelope —
  // unwrap it. storage_path is accepted for compatibility but unused (the
  // server deletes by id).
  const id = payload?.data?.id;
  if (!id) return;
  const r = await fetch(`/api/v1/vault/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) throw await readError(r, "Couldn't delete the document");
}

export async function extractVaultDoc(payload?: { data?: { id?: string } }): Promise<unknown> {
  // Callers pass the Lovable-style { data: { id } } envelope — unwrap it.
  const id = payload?.data?.id;
  if (!id) return null;
  const r = await fetch(`/api/v1/vault/${id}/extract`, { method: 'POST', credentials: 'include' });
  if (!r.ok) throw await readError(r, "Extraction failed");
  return r.json().catch(() => null);
}
