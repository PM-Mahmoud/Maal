
import { z } from "zod";

export async function listVault(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function registerVaultDoc(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function deleteVaultDoc(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function extractVaultDoc(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/vault', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
