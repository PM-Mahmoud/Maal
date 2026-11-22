// Types for shared/spending-breakdown.mjs (pure Breakdown & budget maths, Session 2).
declare module "*spending-breakdown.mjs" {
  type Txn = Record<string, any>;
  export type BreakdownRow = { group: string; amount: number; pct: number; prev: number; change: number | null };
  export type GroupRow = { group: string; amount: number; pct: number; members: string[] };
  export type IncomeRow = { group: string; amount: number; pct: number };
  export type CashFlow = { income: number; expenses: number; net: number };
  export type Frequent = { merchant: string; count: number; total: number; group: string };
  export type HistoryRow = { key: string; year: number; month: number; amount: number };
  export type HistoryStats = { lastMonth: number; average: number; months: number };
  export type SuggestMonth = { key: string; year: number; month: number; income: number; expenses: number; net: number };
  export type SuggestFact =
    | { id: "no_income"; months: number }
    | { id: "negative_cash_flow"; months: number; negativeMonths: number; shortfall: number }
    | { id: "saving"; months: number; savings: number; rate: number }
    | { id: "top_category"; category: string; average: number; share: number }
    | { id: "uncategorised"; average: number; share: number };
  export type Suggestion = {
    enoughData: boolean; monthsUsed: number; months: SuggestMonth[]; spendCount: number;
    avgIncome: number; avgExpenses: number; avgSavings: number; suggested: number;
    range: { min: number; max: number }; slider: { min: number; max: number; step: number };
    categories: Array<{ group: string; average: number; budget: number }>; facts: SuggestFact[];
  };
  export type PotentialSavings = { budget: number; monthlySaving: number | null; overIncome: number; vsTypical: number; tone: "good" | "warn" };

  export const MIN_SPEND_TXNS: number;
  export const SUGGEST_MONTHS: number;
  export const MAX_TRIM: number;
  export const TARGET_SAVINGS_RATE: number;
  export function monthKey(year: number, month: number): string;
  export function firstDataKey(txns: Txn[]): string | null;
  export function breakdownTable(txns: Txn[], year: number, month: number, excluded: string[] | undefined, include?: string[]): BreakdownRow[];
  export function groupRollup(rows: Array<{ group: string; amount: number }>, groups: Array<{ name: string; categories: string[] }>, ungrouped?: string): GroupRow[];
  export function incomeTable(txns: Txn[], year: number, month: number, incomeCategories?: string[]): IncomeRow[];
  export function monthCashFlow(txns: Txn[], year: number, month: number, excluded: string[] | undefined): CashFlow;
  export function largestExpenses(txns: Txn[], year: number, month: number, excluded: string[] | undefined, n?: number): Array<Txn & { spend: number }>;
  export function frequentExpenses(txns: Txn[], year: number, month: number, excluded: string[] | undefined, n?: number): Frequent[];
  export function withAvailable<T extends { spent: number; budget: number }>(rows: T[]): Array<T & { available: number }>;
  export function categoryHistory(txns: Txn[], category: string, endYear: number, endMonth: number, months: number, excluded: string[] | undefined): HistoryRow[];
  export function historyStats(history: HistoryRow[], currentKey: string, fromKey: string | null): HistoryStats;
  export function averageMonthlyIncome(txns: Txn[], today?: Date, months?: number): number;
  export function savingsTarget(income: number, budget: number): { savings: number; pctOfIncome: number | null };
  export function availableForCategory(budgets: Array<{ category_group: string | null; monthly_amount: number | string }>, category: string): number | null;
  export function suggestBudget(txns: Txn[], today?: Date, excluded?: string[]): Suggestion;
  export function potentialSavings(budget: number, avgIncome: number, avgExpenses: number): PotentialSavings;
  export function allowedFigures(s: Suggestion): number[];
}
