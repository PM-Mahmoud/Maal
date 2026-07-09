// lib/profile.ts
// Typed client for the real profile endpoint (GET/PATCH /api/v1/profile),
// backed by db/profiles.js / user_profiles. Replaces the broken
// supabase.from("profiles"/"preferences") calls, which hit non-existent tables
// and silently returned empty stubs.

export type Profile = {
  display_name: string;
  age_band: string | null;
  risk: string | null;
  age: number;
  annual_income: number;
  super_balance: number;
  investment_portfolio: number;
  property_value: number;
  total_debt: number;
  cash_savings: number;
  hecs_balance: number;
  monthly_expenses: number;
  retirement_age: number;
  completed_onboarding: boolean;
  onboarded: boolean;
  created_at: string | null;
};

export async function fetchProfile(): Promise<Profile | null> {
  try {
    const r = await fetch("/api/v1/profile", { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as Profile;
  } catch {
    return null;
  }
}

// Partial update — send only the fields you're changing.
export async function saveProfile(patch: Partial<Profile>): Promise<Profile | null> {
  try {
    const r = await fetch("/api/v1/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return null;
    return (await r.json()) as Profile;
  } catch {
    return null;
  }
}
