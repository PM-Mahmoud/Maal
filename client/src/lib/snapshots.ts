// lib/snapshots.ts
// Real daily net-worth history from the backend (GET /api/v1/snapshots), for the
// dashboard KPI sparklines and trend modal. Replaces the flat placeholder series.

import { handleUnauthenticated } from "@/integrations/api";

export type Snapshot = {
  date: string;
  netWorth: number;
  assets: number;
  super: number;
  investments: number;
  debts: number;
  cash: number;
  change?: { material: boolean; net_change: number; summary: string | null; contributors: Array<{ category: string; impact: number }> } | null;
};

export async function fetchSnapshots(days = 366): Promise<Snapshot[]> {
  try {
    const r = await fetch(`/api/v1/snapshots?days=${days}`, { credentials: "include" });
    if (r.status === 401) handleUnauthenticated();
    if (!r.ok) throw new Error("Could not load balance history.");
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not load balance history.");
  }
}

// Map a snapshot to the value for a given KPI tile kind. Mirrors the tile's
// current-value formula so the sparkline ends at the displayed number.
export function snapshotValue(s: Snapshot, kind: string): number {
  switch (kind) {
    case "kpi_net_worth": return s.netWorth;
    case "kpi_investments": return s.investments + s.super;
    case "kpi_cash": return s.cash;
    case "kpi_debts": return s.debts;
    default: return 0;
  }
}

export function snapshotLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
