// lib/advisor-memory.functions.ts — Ask Maal cross-session memory + custom instructions.

export type AdvisorMemory = { memory: string; customInstructions: string; updatedAt: string | null };

export async function getAdvisorMemory(): Promise<AdvisorMemory> {
  try {
    const r = await fetch("/api/v1/advisor/memory", { credentials: "include" });
    if (!r.ok) return { memory: "", customInstructions: "", updatedAt: null };
    const j = await r.json();
    return { memory: j.memory ?? "", customInstructions: j.customInstructions ?? "", updatedAt: j.updatedAt ?? null };
  } catch {
    return { memory: "", customInstructions: "", updatedAt: null };
  }
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
  await fetch("/api/v1/advisor/memory", { method: "DELETE", credentials: "include" });
}
