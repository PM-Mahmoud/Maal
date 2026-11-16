// Data layer for Settings → Risk profile. Talks to routes/risk-profile.js:
//   GET  /api/v1/risk-profile → { questions, result, ageBand }
//   POST /api/v1/risk-profile { answers } → { result }   (scored server-side)
import { handleUnauthenticated } from "@/integrations/api";

export type RiskBand = "conservative" | "balanced" | "growth" | "high-growth";

export interface RiskOption { value: string; label: string }
export interface RiskQuestion { id: string; title: string; options: RiskOption[] }
export interface RiskStep { id: string; title: string; questions: string[] }
export interface RiskProfileInfo { id: RiskBand; label: string; summary: string; detail: string }
export interface RiskQuestionnaire { version: number; steps: RiskStep[]; questions: RiskQuestion[]; profiles: RiskProfileInfo[] }

export interface RiskResult {
  profile: RiskBand;
  label: string;
  summary: string;
  detail: string;
  answers: Record<string, string>;
  completed_at: string | null;
  version: number;
}

export interface RiskProfileState { questions: RiskQuestionnaire; result: RiskResult | null; ageBand: string | null }

export const BANDS: RiskBand[] = ["conservative", "balanced", "growth", "high-growth"];

async function readError(r: Response, fallback: string): Promise<string> {
  try { const j = await r.json(); return typeof j.error === "string" ? j.error : fallback; } catch { return fallback; }
}

export async function fetchRiskProfile(): Promise<RiskProfileState> {
  const r = await fetch("/api/v1/risk-profile", { credentials: "include", headers: { Accept: "application/json" } });
  if (r.status === 401) handleUnauthenticated();
  if (!r.ok) throw new Error(await readError(r, "Could not load your risk profile."));
  const j = (await r.json()) as Partial<RiskProfileState> | null;
  if (!j || !j.questions || !Array.isArray(j.questions.steps) || !Array.isArray(j.questions.questions)) {
    throw new Error("Could not load your risk profile.");
  }
  return { questions: j.questions, result: j.result ?? null, ageBand: j.ageBand ?? null };
}

export async function submitRiskProfile(answers: Record<string, string>): Promise<RiskResult> {
  const r = await fetch("/api/v1/risk-profile", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (r.status === 401) handleUnauthenticated();
  if (!r.ok) throw new Error(await readError(r, "Could not save your risk profile. Please try again."));
  return ((await r.json()) as { result: RiskResult }).result;
}
