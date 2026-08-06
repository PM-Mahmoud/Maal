// lib/transactions-depth.functions.ts — categories, rules, subscriptions (PR 6).

export type CategoryGroup = { group: string; categories: string[] };
export type TxnRule = { id: number; name: string | null; match_type: string; match_text: string; category_group: string; category: string | null; priority: number; amount_direction: "any" | "debit" | "credit" };
export type Subscription = { merchant: string; amount: number; cadence: string; occurrences: number; lastDate: string | null; nextEstimate: string | null };
export type RecurringTransaction = { kind: "income" | "bill" | "subscription"; merchant: string; averageAmount: number; minAmount: number; maxAmount: number; cadence: string; confidence: number; occurrences: number; lastDate: string | null; nextEstimate: string | null };
export type Reconciliation = { account_reference: string; provider_balance: number | string | null; calculated_balance: number | string | null; adjusted_balance: number | string | null; difference: number | string | null; adjustment_total: number | string; status: "matched" | "mismatch" | "insufficient_data"; checked_at: string };
export type ReconciliationAdjustment = { id: number; amount: number | string; reason: string; effective_at: string; created_at: string };

export async function getReconciliations(): Promise<Reconciliation[]> {
  const r = await fetch("/api/v1/reconciliations", { credentials: "include" });
  if (!r.ok) throw new Error("Couldn't load account reconciliation status.");
  return (await r.json()).reconciliations ?? [];
}

export async function getReconciliationAdjustments(accountReference: string): Promise<ReconciliationAdjustment[]> {
  const r = await fetch(`/api/v1/reconciliations/${encodeURIComponent(accountReference)}/adjustments`, { credentials: "include" });
  if (!r.ok) throw new Error("Couldn't load adjustment history.");
  return (await r.json()).adjustments ?? [];
}

export async function createReconciliationAdjustment(accountReference: string, input: { amount: number; reason: string; effective_at: string }): Promise<void> {
  const r = await fetch(`/api/v1/reconciliations/${encodeURIComponent(accountReference)}/adjustments`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't save the adjustment.");
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  try {
    const r = await fetch("/api/v1/transactions/recurring", { credentials: "include" });
    if (!r.ok) return [];
    return (await r.json()).recurring ?? [];
  } catch { return []; }
}

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

export async function createRule(rule: { name?: string; match_type: string; match_text: string; category_group: string; category?: string; priority?: number; amount_direction?: "any" | "debit" | "credit" }): Promise<boolean> {
  try {
    const r = await fetch("/api/v1/transaction-rules", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rule),
    });
    return r.ok;
  } catch { return false; }
}

export async function deleteRule(id: number): Promise<boolean> {
  try {
    const r = await fetch(`/api/v1/transaction-rules/${id}`, { method: "DELETE", credentials: "include" });
    return r.ok;
  } catch { return false; }
}

export async function applyRules(): Promise<number> {
  try {
    const r = await fetch("/api/v1/transaction-rules/apply", { method: "POST", credentials: "include" });
    if (!r.ok) return 0;
    return (await r.json()).applied ?? 0;
  } catch { return 0; }
}

export async function setTransactionCategory(id: number, category_group: string, category?: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/v1/transactions/${id}/category`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_group, category }),
    });
    return r.ok;
  } catch { return false; }
}
