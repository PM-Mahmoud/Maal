export async function listTransactions(): Promise<unknown[]> {
  const r = await fetch('/api/v1/transactions', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function seedMockTransactions(): Promise<void> {}
export async function clearTransactions(): Promise<void> {}
export async function addTransaction(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
