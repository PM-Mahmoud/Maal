// lib/maalScore.ts
// Fetches the AUTHORITATIVE Maal Score from the backend (GET /api/v1/score),
// computed by lib/maal-score.js over the user's real merged profile — the same
// engine the EJS dashboard uses. This replaces the client-side score reimpl in
// lib/score.ts for anything user-facing (that duplicate should be retired).

export type MaalPillar = {
  key: string;
  label: string;
  score: number; // 0–100
  weight: number;
  note: string;
};

export type MaalScore = {
  score: number; // 0–100 composite
  band: string; // Excellent | Strong | Fair | …
  pillars: MaalPillar[];
  hasData: boolean;
  history: Array<{ value: number; at: string }>; // oldest-first
};

export async function fetchMaalScore(): Promise<MaalScore | null> {
  try {
    const r = await fetch("/api/v1/score", { credentials: "include" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.ok === false) return null;
    return {
      score: Number(j.score) || 0,
      band: typeof j.band === "string" ? j.band : "",
      pillars: Array.isArray(j.pillars) ? j.pillars : [],
      hasData: !!j.hasData,
      history: Array.isArray(j.history) ? j.history : [],
    };
  } catch {
    return null;
  }
}
