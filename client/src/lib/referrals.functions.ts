// lib/referrals.functions.ts — the member's referral link + progress (GET /api/v1/referrals)

export type ReferralSummary = {
  code: string;
  link: string;
  signedUp: number;
  paid: number;
  towardsNext: number; // paid friends counting toward the next reward (0..needed)
  needed: number; // 3
  rewardStatus: "pending" | "applied" | null;
};

export async function getReferrals(): Promise<ReferralSummary | null> {
  try {
    const r = await fetch("/api/v1/referrals", { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as ReferralSummary;
  } catch {
    return null;
  }
}
