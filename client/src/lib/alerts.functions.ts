
import { z } from "zod";
import { getMarketIndices, getMarketNews } from "./markets.functions";

const FREQ = ["daily", "weekly", "monthly"] as const;
const TEMPLATES = ["portfolio", "tax", "property", "cashflow", "news", "custom"] as const;

export async function listAlerts(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function createAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function deleteAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function toggleAlert(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function evaluateAlerts(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/alerts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
