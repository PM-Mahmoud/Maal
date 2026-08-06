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
  investmentPerformance?: { return_pct: number | null; investment_gain: number | null; net_contributions: number };
  cashForecast?: { accounts: Array<{ opening_balance: number; closing_balance: number }> };
};

export async function fetchSnapshots(days = 366): Promise<Snapshot[]> {
  try {
    const r = await fetch(`/api/v1/snapshots?days=${days}`, { credentials: "include" });
    if (r.status === 401) handleUnauthenticated();
    if (!r.ok) throw new Error("Could not load balance history.");
    const j = await r.json();
    const snapshots: Snapshot[] = Array.isArray(j) ? j : [];
    if (snapshots.length) {
      const performance = await fetch(`/api/v1/investment-performance?days=${days}`, { credentials: "include" });
      if (performance.ok) snapshots[snapshots.length - 1].investmentPerformance = await performance.json();
      const forecast = await fetch("/api/v1/cashflow-forecast?days=30", { credentials: "include" });
      if (forecast.ok) snapshots[snapshots.length - 1].cashForecast = await forecast.json();
    }
    return snapshots;
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
