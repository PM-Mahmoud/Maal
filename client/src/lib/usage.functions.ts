// lib/usage.functions.ts — plan + per-feature usage metering (GET /api/v1/usage)

export type UsageFeature = { used: number; limit: number };
export type Usage = {
  plan: "free" | "pro" | "max";
  period: string; // 'YYYY-MM'
  resetsOn: string; // 'YYYY-MM-DD'
  features: Record<string, UsageFeature>;
};

export async function getUsage(): Promise<Usage | null> {
  try {
    const r = await fetch("/api/v1/usage", { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as Usage;
  } catch {
    return null;
  }
}
