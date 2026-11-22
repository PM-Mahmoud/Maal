// Types for shared/spending-overview.mjs (pure Spending overview maths).
declare module "*spending-overview.mjs" {
  type Txn = Record<string, any>;
  export type MonthSeries = { days: number; total: number; daily: Array<number | null>; cumulative: Array<number | null> };
  export type BudgetUsage = { budget: number; used: number; pct: number; remaining: number; over: boolean };
  export type CategoryRow = { group: string; amount: number; pct: number };
  export type BudgetRow = { group: string; spent: number; budget: number; pct: number; rest?: boolean };
  export type ProjectedPayment = { date: string; merchant: string; amount: number; kind: string };
  export type CashFlowRow = { key: string; year: number; month: number; income: number; expenses: number; net: number };
  export type CashFlowSummary = { income: number; expenses: number; net: number; avgPerMonth: number };
  export type SankeyNode = { label: string; amount: number; pct: number };
  export type SankeyFlows = { sources: SankeyNode[]; targets: SankeyNode[]; totalIn: number; totalOut: number };

  export const DEFAULT_EXCLUDED_GROUPS: readonly string[];
  export function isoDay(d: Date): string;
  export function txnDay(t: Txn): string | null;
  export function groupOf(t: Txn): string;
  export function countsAsSpend(t: Txn, excluded: string[] | undefined): boolean;
  export function isIncome(t: Txn): boolean;
  export function monthCumulative(txns: Txn[], year: number, month: number, excluded: string[] | undefined, today?: Date): MonthSeries;
  export function shiftMonth(year: number, month: number, offset: number): { year: number; month: number };
  export function budgetUsage(input: { spent: number; budget: number | string | null | undefined; upcoming?: number; includeUpcoming?: boolean }): BudgetUsage | null;
  export function categoryBreakdown(txns: Txn[], year: number, month: number, excluded: string[] | undefined): CategoryRow[];
  export function budgetRows(breakdown: CategoryRow[], budgets: Array<{ category_group: string | null; monthly_amount: number | string }>): BudgetRow[];
  export function projectRecurring(recurring: Txn[], from: string, to: string, kinds?: string[]): ProjectedPayment[];
  export function upcomingThisMonth(recurring: Txn[], today?: Date): number;
  export function twoWeekWindow(today?: Date): Date[];
  export function mondayOffset(year: number, month: number): number;
  export function monthlyCashFlow(txns: Txn[], endYear: number, endMonth: number, months: number, excluded: string[] | undefined): CashFlowRow[];
  export function cashFlowSummary(rows: CashFlowRow[]): CashFlowSummary;
  export function sankeyFlows(txns: Txn[], fromKey: string, toKey: string, excluded: string[] | undefined, by?: "category" | "merchant", top?: number): SankeyFlows;
}
