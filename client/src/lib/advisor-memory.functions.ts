// lib/advisor-memory.functions.ts — Ask Maal cross-session memory + custom instructions.

export type AdvisorMemory = { memory: string; customInstructions: string; updatedAt: string | null };

async function throwServerError(r: Response, fallback: string): Promise<never> {
  let msg: string | undefined;
  try { msg = (await r.json())?.error; } catch { /* non-JSON body */ }
  throw new Error(msg || fallback);
}

export async function getAdvisorMemory(): Promise<AdvisorMemory> {
  const r = await fetch("/api/v1/advisor/memory", { credentials: "include" });
  // Throw (not silent empty) so a failed load can't masquerade as a
  // confirmed-empty memory — callers keep editing disabled behind an error
  // state until a load genuinely succeeds.
  if (!r.ok) return throwServerError(r, "Could not load advisor memory.");
  const j = await r.json();
  return { memory: j.memory ?? "", customInstructions: j.customInstructions ?? "", updatedAt: j.updatedAt ?? null };
}

export async function saveAdvisorMemory(patch: { memory?: string; customInstructions?: string }): Promise<boolean> {
  const r = await fetch("/api/v1/advisor/memory", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.ok;
}

export async function clearAdvisorMemory(): Promise<void> {
  const r = await fetch("/api/v1/advisor/memory", { method: "DELETE", credentials: "include" });
  // Throw so "Forget everything" only resets local state after the server
  // confirms the delete.
  if (!r.ok) return throwServerError(r, "Could not clear advisor memory.");
}
