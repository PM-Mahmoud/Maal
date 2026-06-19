
import { z } from "zod";

const Inputs = z.object({
  age: z.number(),
  superBalance: z.number(),
  annualIncome: z.number(),
  contributionRatePct: z.number(),
  expectedReturnPct: z.number(),
  target: z.number(),
  household: z.enum(["single", "couple"]),
});

const Result = z.object({
  probOfHittingTarget: z.number(),
  shortfallReal: z.number(),
  finalMedian: z.number(),
});

export async function listScenarios(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/retirement', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function saveScenario(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/retirement', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function deleteScenario(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/retirement', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
