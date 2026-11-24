// Client for the Session 2 "Breakdown & budget" endpoints (routes/api.js,
// "Session 2 – Breakdown & budget" block). Budgets reuse ../settings/api.
import { usageLimitError } from "@/lib/usage-limit.mjs";
import type { Suggestion } from "../../../../../../shared/spending-breakdown.mjs";
import { PICKER_COLOURS } from "../../../../../../shared/category-colours.mjs";

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

export async function updateCategory(id: string, patch: Partial<Pick<CustomCategory, "name" | "color" | "icon">>): Promise<CustomCategory> {
  const r = await fetch(`/api/v1/spending-categories/${encodeURIComponent(id)}`, send("PATCH", patch));
  return (await json<{ category: CustomCategory }>(r, "Couldn't update that category.")).category;
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
  const body = await r.json().catch(() => null);
  if (!r.ok) throw usageLimitError(r.status, body) ?? new Error(body?.error || "Couldn't work out a budget right now.");
  return body as SuggestionResponse;
}

// Swatches for new categories/groups: the shared category palette
// (shared/category-colours.mjs PICKER_COLOURS; lib/spending-categories.js accepts them).
export const CATEGORY_COLORS: readonly string[] = PICKER_COLOURS;
