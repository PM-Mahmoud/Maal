
import { z } from "zod";

export async function listTransactions(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function seedMockTransactions(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function clearTransactions(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function addTransaction(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
