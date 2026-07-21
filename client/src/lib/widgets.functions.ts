// lib/widgets.functions.ts — dashboard widgets saved from Ask Maal.

import { handleUnauthenticated } from "@/integrations/api";

export type WidgetSpec = {
  id?: number;
  source: string;
  type: "donut" | "line" | "table" | "stat-cards";
  title: string;
  data: any;
};

async function throwServerError(r: Response, fallback: string): Promise<never> {
  // A 401 means the session is stale — recover it centrally instead of
  // surfacing a per-widget error.
  if (r.status === 401) handleUnauthenticated();
  let msg: string | undefined;
  try { msg = (await r.json())?.error; } catch { /* non-JSON body */ }
  throw new Error(msg || fallback);
}

export async function listWidgets(): Promise<WidgetSpec[]> {
  const r = await fetch("/api/v1/widgets", { credentials: "include" });
  // Throw (not silent []) so a failed load is distinguishable from a
  // confirmed-empty list at the call site.
  if (!r.ok) return throwServerError(r, "Could not load saved widgets.");
  const j = await r.json();
  return Array.isArray(j?.widgets) ? j.widgets : [];
}

export async function addWidget(source: string, title?: string): Promise<boolean> {
  const r = await fetch("/api/v1/widgets", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, title }),
  });
  if (r.status === 401) handleUnauthenticated();
  return r.ok;
}

export async function removeWidget(id: number): Promise<void> {
  const r = await fetch(`/api/v1/widgets/${id}`, { method: "DELETE", credentials: "include" });
  // Throw so an optimistically-removed widget can be restored when the
  // server-side delete actually failed.
  if (!r.ok) return throwServerError(r, "Could not remove widget.");
}
