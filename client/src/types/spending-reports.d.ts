// Types for shared/spending-reports.mjs (pure Spending Reports maths).
declare module "*spending-reports.mjs" {
  type Txn = Record<string, any>;
  export type ReportTab = "cashflow" | "expenses" | "income" | "transfers";
  export type RangePreset = "this-month" | "last-month" | "3m" | "6m" | "12m" | "ytd" | "fy" | "last-fy" | "custom";
  export type Interval = "week" | "month" | "quarter";
  export type ViewBy = "category" | "merchant";
  export type Kind = "income" | "expense" | "transfer";
  export type ReportFilters = { groups: string[]; merchant: string };
  export type RangeConfig = { preset: RangePreset; from?: string; to?: string };
  export type ResolvedRange = { preset: RangePreset; custom: boolean; from: string; to: string };
  export type Period = { key: string; start: string; end: string };
  export type CashFlowPeriod = Period & { income: number; expenses: number; net: number };
  export type BreakdownRow = { label: string; group: string | null; amount: number; pct: number; count: number };
  export type StackedPeriod = Period & { total: number; segments: number[] };
  export type TransferPeriod = Period & { moneyIn: number; moneyOut: number; total: number };

  export const REPORT_TABS: readonly ReportTab[];
  export const RANGE_PRESETS: readonly RangePreset[];
  export const INTERVALS: readonly Interval[];
  export const MAX_RANGE_DAYS: number;
  export function parseDay(s: string): Date | null;
  export function daysBetween(a: Date, b: Date): number;
  export function fyStartYear(d: Date): number;
  export function resolveRange(range: RangeConfig | null | undefined, today?: Date): ResolvedRange | null;
  export function presetLabel(preset: string): string;
  export function periods(from: string, to: string, interval?: Interval): Period[];
  export function merchantOf(t: Txn): string;
  export function kindOf(t: Txn, excluded: string[] | undefined): Kind | null;
  export function emptyFilters(): ReportFilters;
  export function activeFilterCount(filters: ReportFilters | null | undefined): number;
  export function applyFilters<T extends Txn>(txns: T[], filters: ReportFilters | null | undefined, from: string | null, to: string | null): T[];
  export function cashFlowByPeriod(txns: Txn[], from: string, to: string, interval: Interval, excluded: string[] | undefined): CashFlowPeriod[];
  export function cashFlowTotals(rows: CashFlowPeriod[]): { income: number; expenses: number; net: number; avgPerPeriod: number };
  export function breakdown(txns: Txn[], kind: Kind, by?: ViewBy, excluded?: string[] | undefined, top?: number): { total: number; rows: BreakdownRow[] };
  export function stackedByPeriod(txns: Txn[], kind: Kind, from: string, to: string, interval: Interval, by?: ViewBy, excluded?: string[] | undefined, top?: number): { labels: string[]; rows: StackedPeriod[] };
  export function transfersByPeriod(txns: Txn[], from: string, to: string, interval: Interval): TransferPeriod[];
  export function periodChanges(totals: number[]): Array<number | null>;
  export function totalsOf(values: number[]): { total: number; avgPerPeriod: number };
  export function suggestViewName(config: unknown): string;
  export function sameConfig(a: unknown, b: unknown): boolean;
}
