// Client for the Session 2 "Breakdown & budget" endpoints (routes/api.js,
// "Session 2 – Breakdown & budget" block). Budgets reuse ../settings/api.
import type { Suggestion } from "../../../../../../shared/spending-breakdown.mjs";

export type CustomCategory = { id: string; name: string; kind: "expense" | "income"; color: string; icon: string };
export type CategoryGroupDef = { id: string; name: string; kind: "expense" | "income"; color: string; categories: string[] };
export type Wording = { summary: string; why: string[] };
export type SuggestionResponse = {
  suggestion: Suggestion;
  wording: Wording | null;
  wording_status: "ok" | "unavailable" | "plan" | "limit" | "failed" | "skipped";
};

async function json<T>(r: Response, fallback: string): Promise<T> {
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body && body.error) || fallback);
  return body as T;
}
const send = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function getSpendingCategories(): Promise<{ categories: CustomCategory[]; groups: CategoryGroupDef[] }> {
  const r = await fetch("/api/v1/spending-categories", { credentials: "include" });
  return json(r, "Couldn't load your categories.");
}

export async function createCategory(input: Omit<CustomCategory, "id">): Promise<CustomCategory> {
  const r = await fetch("/api/v1/spending-categories", send("POST", input));
  return (await json<{ category: CustomCategory }>(r, "Couldn't create that category.")).category;
}

export async function deleteCategory(id: string): Promise<void> {
  const r = await fetch(`/api/v1/spending-categories/${encodeURIComponent(id)}`, send("DELETE"));
  await json(r, "Couldn't delete that category.");
}

export async function createGroup(input: Omit<CategoryGroupDef, "id">): Promise<CategoryGroupDef> {
  const r = await fetch("/api/v1/spending-category-groups", send("POST", input));
  return (await json<{ group: CategoryGroupDef }>(r, "Couldn't create that group.")).group;
}

export async function updateGroup(id: string, patch: Partial<Omit<CategoryGroupDef, "id">>): Promise<void> {
  const r = await fetch(`/api/v1/spending-category-groups/${encodeURIComponent(id)}`, send("PATCH", patch));
  await json(r, "Couldn't update that group.");
}

export async function deleteGroup(id: string): Promise<void> {
  const r = await fetch(`/api/v1/spending-category-groups/${encodeURIComponent(id)}`, send("DELETE"));
  await json(r, "Couldn't delete that group.");
}

export async function deleteBudget(id: string): Promise<void> {
  const r = await fetch(`/api/v1/budgets/${encodeURIComponent(id)}`, send("DELETE"));
  await json(r, "Couldn't remove that budget.");
}

export async function getBudgetSuggestion(): Promise<SuggestionResponse> {
  const r = await fetch("/api/v1/budgets/suggestion", { credentials: "include" });
  return json(r, "Couldn't work out a budget right now.");
}

// Must match lib/spending-categories.js COLORS / ICONS (server validates).
export const CATEGORY_COLORS = [
  "#121313", "#4B4D4A", "#8A8C88", "#C9CAC6",
  "#2F5D50", "#3E7C6B", "#6C9A8B", "#A8C5B9",
  "#2C4A6B", "#4E6E94", "#8BA4C2", "#C3D1E2",
  "#7A4A2A", "#A86E45", "#C99A6E", "#E3C9AE",
  "#6B2F3A", "#9A4E5B", "#C48A94", "#5B4A7A",
];
