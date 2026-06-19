export async function listGoals(): Promise<unknown[]> {
  const r = await fetch('/api/v1/goals', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function upsertGoal(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/goals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.ok ? r.json() : null;
}
export async function deleteGoal(data?: unknown): Promise<void> {
  const { id } = (data ?? {}) as { id?: string };
  await fetch(`/api/v1/goals/${id}`, { method: 'DELETE', credentials: 'include' });
}
