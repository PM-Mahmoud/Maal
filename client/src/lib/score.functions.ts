import { computeMaalScore, type ScoreInputs } from "@/lib/score";

export async function recomputeScore(): Promise<{ total: number; netWorth: number; pillars: unknown[] }> {
  const r = await fetch("/api/v1/score/compute", { method: "POST", credentials: "include" });
  if (!r.ok) throw new Error("Failed to compute score");
  return r.json();
}
