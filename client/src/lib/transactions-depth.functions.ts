// lib/transactions-depth.functions.ts — categories, rules, subscriptions (PR 6).

export type CategoryGroup = { group: string; categories: string[] };
export type TxnRule = { id: number; name: string | null; match_type: string; match_text: string; category_group: string; category: string | null };
export type Subscription = { merchant: string; amount: number; cadence: string; occurrences: number; lastDate: string | null; nextEstimate: string | null };

export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  try {
    const r = await fetch("/api/v1/transaction-categories", { credentials: "include" });
    if (!r.ok) return [];
    return (await r.json()).groups ?? [];
  } catch { return []; }
}

export async function getSubscriptions(): Promise<Subscription[]> {
  try {
    const r = await fetch("/api/v1/transactions/subscriptions", { credentials: "include" });
    if (!r.ok) return [];
    return (await r.json()).subscriptions ?? [];
  } catch { return []; }
}

export async function listRules(): Promise<TxnRule[]> {
  try {
    const r = await fetch("/api/v1/transaction-rules", { credentials: "include" });
    if (!r.ok) return [];
    return (await r.json()).rules ?? [];
  } catch { return []; }
}

export async function createRule(rule: { name?: string; match_type: string; match_text: string; category_group: string; category?: string }): Promise<boolean> {
  const r = await fetch("/api/v1/transaction-rules", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rule),
  });
  return r.ok;
}

export async function deleteRule(id: number): Promise<void> {
  await fetch(`/api/v1/transaction-rules/${id}`, { method: "DELETE", credentials: "include" });
}

export async function applyRules(): Promise<number> {
  const r = await fetch("/api/v1/transaction-rules/apply", { method: "POST", credentials: "include" });
  if (!r.ok) return 0;
  return (await r.json()).applied ?? 0;
}

export async function setTransactionCategory(id: number, category_group: string, category?: string): Promise<boolean> {
  const r = await fetch(`/api/v1/transactions/${id}/category`, {
    method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_group, category }),
  });
  return r.ok;
}
