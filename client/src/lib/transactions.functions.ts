// Reads the server's error body (when present) into an Error so callers can
// distinguish a failure from a valid empty result. Auth failures get an
// explicit session message unless the server supplied one.
async function readError(r: Response, fallback: string): Promise<Error> {
  let msg = fallback;
  if (r.status === 401 || r.status === 403) msg = "Your session has expired — sign in again.";
  try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch { /* body wasn't JSON */ }
  return new Error(msg);
}

export async function listTransactions(): Promise<unknown[]> {
  const r = await fetch('/api/v1/transactions', { credentials: 'include' });
  if (!r.ok) throw await readError(r, "Couldn't load transactions");
  const j = await r.json().catch(() => null);
  return Array.isArray(j) ? j : [];
}
export async function seedMockTransactions(): Promise<void> {}
export async function clearTransactions(): Promise<void> {}
export async function addTransaction(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw await readError(r, "Couldn't add the transaction");
  return r.json().catch(() => null);
}
