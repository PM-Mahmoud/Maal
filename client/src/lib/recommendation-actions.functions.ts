export type RecommendationAction = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: "pending" | "in_progress" | "completed" | "dismissed";
  impact_score: number;
  urgency_score: number;
  confidence_score: number;
  effort_score: number;
  rank_score: number;
  ranking: { methodology_version: string; formula: string };
  baseline: { value: number | null; unit: string | null };
  target: { operator: string; value: number; unit: string } | null;
  events: Array<{ id: string; from_status: string; to_status: string; occurred_at: string }>;
  outcomes: Array<{ id: string; metric: string; value: number; unit: string; baseline_value: number | null; delta: number | null; measured_at: string; note: string | null }>;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not update your action plan");
  return body;
}
export const listRecommendationActions = (): Promise<RecommendationAction[]> => request("/api/v1/recommendation-actions");
export const refreshRecommendationActions = (): Promise<RecommendationAction[]> => request("/api/v1/recommendation-actions/refresh", { method: "POST" });
export const updateRecommendationAction = (id: string, status: RecommendationAction["status"]): Promise<RecommendationAction> => request(`/api/v1/recommendation-actions/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
export const measureRecommendationOutcome = (id: string): Promise<unknown> => request(`/api/v1/recommendation-actions/${id}/outcomes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
