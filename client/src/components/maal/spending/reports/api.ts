// Client for the Session 2 – Reports endpoints in routes/api.js:
//   GET /api/v1/reports/transactions?from&to  (date-ranged, paged server-side)
//   GET/POST/PATCH/DELETE /api/v1/report-views  (saved report views)
import type { Interval, RangeConfig, ReportFilters, ReportTab, ViewBy } from "../../../../../../shared/spending-reports.mjs";
import type { SpendTxn } from "../overview/useSpendingData";

export type ChartType = "net" | "split" | "flow" | "bars" | "donut";

/** A report's full state — what a saved view stores (validated by lib/report-views.js). */
export type ReportConfig = {
  tab: ReportTab;
  chart: ChartType;
  interval: Interval;
  viewBy: ViewBy;
  range: RangeConfig;
  filters: ReportFilters;
};

export type SavedView = { id: string; name: string; config: ReportConfig; created_at: string | null; updated_at: string | null };

async function json<T>(r: Response, fallback: string): Promise<T> {
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = r.status === 401 ? "Your session has expired — sign in again." : (body && body.error) || fallback;
    throw new Error(msg);
  }
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function getReportTransactions(from: string, to: string, signal?: AbortSignal): Promise<{ transactions: SpendTxn[]; truncated: boolean }> {
  const q = new URLSearchParams({ from, to });
  const r = await fetch(`/api/v1/reports/transactions?${q}`, { credentials: "include", signal });
  const j = await json<{ transactions?: SpendTxn[]; truncated?: boolean }>(r, "Couldn't load transactions for this report.");
  return { transactions: Array.isArray(j.transactions) ? j.transactions : [], truncated: !!j.truncated };
}

export async function listViews(): Promise<SavedView[]> {
  const r = await fetch("/api/v1/report-views", { credentials: "include" });
  const j = await json<{ views?: SavedView[] }>(r, "Couldn't load your saved reports.");
  return Array.isArray(j.views) ? j.views : [];
}

export async function createView(name: string, config: ReportConfig): Promise<SavedView> {
  const r = await fetch("/api/v1/report-views", send("POST", { name, config }));
  return (await json<{ view: SavedView }>(r, "Couldn't save this report.")).view;
}

export async function updateView(id: string, patch: { name?: string; config?: ReportConfig }): Promise<SavedView> {
  const r = await fetch(`/api/v1/report-views/${encodeURIComponent(id)}`, send("PATCH", patch));
  return (await json<{ view: SavedView }>(r, "Couldn't update this report.")).view;
}

export async function deleteView(id: string): Promise<void> {
  const r = await fetch(`/api/v1/report-views/${encodeURIComponent(id)}`, send("DELETE"));
  await json(r, "Couldn't delete this report.");
}
