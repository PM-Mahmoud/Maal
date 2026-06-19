
import { z } from "zod";

export async function listGoals(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/goals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function upsertGoal(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/goals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function deleteGoal(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/goals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
