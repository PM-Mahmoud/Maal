// Client for routes/spending-settings.js (budgets + spending settings).
// Rules reuse the existing /api/v1/transaction-rules helpers.

export type SpendingSettings = { include_upcoming: boolean; excluded_groups: string[] };
export type Budget = { id: string; category_group: string | null; monthly_amount: number; updated_at: string | null };

async function json<T>(r: Response, fallback: string): Promise<T> {
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body && body.error) || fallback);
  return body as T;
}

const opts = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function getSpendingSettings(): Promise<SpendingSettings> {
  const r = await fetch("/api/v1/spending-settings", { credentials: "include" });
  return (await json<{ settings: SpendingSettings }>(r, "Couldn't load your spending settings.")).settings;
}

export async function updateSpendingSettings(patch: Partial<SpendingSettings>): Promise<SpendingSettings> {
  const r = await fetch("/api/v1/spending-settings", opts("PATCH", patch));
  return (await json<{ settings: SpendingSettings }>(r, "Couldn't save that setting.")).settings;
}

export async function getBudgets(): Promise<{ budgets: Budget[]; total: number }> {
  const r = await fetch("/api/v1/budgets", { credentials: "include" });
  return json(r, "Couldn't load your budget.");
}

export async function saveBudget(input: { category_group: string | null; monthly_amount: number | string }): Promise<Budget> {
  const r = await fetch("/api/v1/budgets", opts("PUT", input));
  return (await json<{ budget: Budget }>(r, "Couldn't save your budget.")).budget;
}

/** Reset: deletes every budget the user has. Transactions are not touched. */
export async function resetBudgets(): Promise<number> {
  const r = await fetch("/api/v1/budgets", opts("DELETE"));
  return (await json<{ deleted: number }>(r, "Couldn't reset your budget.")).deleted;
}

export const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
