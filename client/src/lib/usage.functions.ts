// lib/usage.functions.ts — plan, trial + per-feature usage (GET /api/v1/usage)

// `limit` is null when the number is intentionally not shown (the member
// Ask Maal cap is never advertised).
export type UsageFeature = { used: number; limit: number | null };
export type Usage = {
  // Effective plan: 'member' during the 14-day trial; 'free' once it ends unpaid.
  plan: "free" | "member" | "pro" | "max";
  basePlan: string; // what's stored on the account (free / member / legacy pro, max)
  paid: boolean;
  paywalled: boolean;
  trial: { active: boolean; endsAt: string | null; daysLeft: number } | null;
  offer: { firstYear: string; renewal: string; line: string };
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
