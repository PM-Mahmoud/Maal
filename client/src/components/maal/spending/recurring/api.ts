// Client for the Session 2 – Recurring endpoints (routes/api.js):
//   GET    /api/v1/transactions/recurring   merged manual + detected
//   POST   /api/v1/recurring-items          add a manual item
//   PATCH  /api/v1/recurring-items/:id      edit a manual item
//   DELETE /api/v1/recurring-items/:id      remove a manual item
//   POST   /api/v1/recurring-items/decisions          dismiss / confirm a detected row
//   DELETE /api/v1/recurring-items/decisions/:key     undo that
import type { Frequency, RecurringInput, RecurringKind } from "../../../../../../shared/recurring.mjs";

/** One row of GET /api/v1/transactions/recurring (detector fields + additive id/source/confirmed). */
export type RecurringItem = {
  id: string;
  kind: RecurringKind;
  merchant: string;
  merchant_key?: string | null;
  averageAmount: number;
  cadence: Frequency;
  nextEstimate: string;
  lastDate?: string | null;
  occurrences?: number | null;
  confidence?: number;
  category_group?: string | null;
  source: "manual" | "detected";
  confirmed?: boolean;
};

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

export async function listRecurring(): Promise<{ items: RecurringItem[]; manualError: boolean }> {
  const r = await fetch("/api/v1/transactions/recurring", { credentials: "include" });
  const j = await json<{ recurring?: RecurringItem[]; manual_error?: boolean }>(r, "Couldn't load your recurring payments.");
  return { items: Array.isArray(j?.recurring) ? j.recurring : [], manualError: Boolean(j?.manual_error) };
}

/** "manual:12" → "12" (null for detected rows). */
export function manualRowId(item: Pick<RecurringItem, "id" | "source">): string | null {
  return item.source === "manual" && item.id.startsWith("manual:") ? item.id.slice(7) : null;
}

export async function createRecurringItem(input: RecurringInput) {
  const r = await fetch("/api/v1/recurring-items", opts("POST", input));
  return (await json<{ item: RecurringItem }>(r, "Couldn't save this recurring item.")).item;
}

export async function updateRecurringItem(rowId: string, patch: Partial<RecurringInput>) {
  const r = await fetch(`/api/v1/recurring-items/${encodeURIComponent(rowId)}`, opts("PATCH", patch));
  return (await json<{ item: RecurringItem }>(r, "Couldn't update this recurring item.")).item;
}

export async function deleteRecurringItem(rowId: string) {
  const r = await fetch(`/api/v1/recurring-items/${encodeURIComponent(rowId)}`, opts("DELETE"));
  await json(r, "Couldn't remove this recurring item.");
}

export async function decideDetected(sourceKey: string, status: "dismissed" | "confirmed") {
  const r = await fetch("/api/v1/recurring-items/decisions", opts("POST", { source_key: sourceKey, status }));
  await json(r, "Couldn't save that change.");
}

export async function undoDecision(sourceKey: string) {
  const r = await fetch(`/api/v1/recurring-items/decisions/${encodeURIComponent(sourceKey)}`, opts("DELETE"));
  await json(r, "Couldn't undo that change.");
}
