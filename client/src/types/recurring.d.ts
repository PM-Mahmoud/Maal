// Types for shared/recurring.mjs (pure Spending › Recurring maths).
declare module "*recurring.mjs" {
  export type Frequency = "weekly" | "fortnightly" | "monthly" | "yearly";
  export type RecurringKind = "bill" | "subscription" | "income";
  export type Occurrence = { date: string; id?: string; merchant: string; amount: number; kind: RecurringKind; cadence: Frequency; source: "manual" | "detected" };
  export type WindowSummary = {
    bills: { count: number; total: number };
    subscriptions: { count: number; total: number };
    income: { count: number; total: number };
    outgoing: number;
  };
  export type MonthlyTotals = { bills: number; subscriptions: number; income: number; outgoing: number; net: number };
  export type CardPayment = { key: string; name: string; institution: string | null; lastAmount: number; lastDate: string; count: number };
  export type RecurringInput = {
    name: string; amount: number; frequency: Frequency; kind: RecurringKind; next_date: string;
    category_group?: string | null; source_key?: string | null; transaction_id?: string | null;
  };

  export const FREQUENCIES: Frequency[];
  export const KINDS: RecurringKind[];
  export const FREQUENCY_LABELS: Record<Frequency, string>;
  export const KIND_LABELS: Record<RecurringKind, string>;
  export function isoDay(d: Date): string;
  export function parseDay(s: unknown): Date | null;
  export function stepDate(d: Date, cadence: string, anchorDay?: number): Date | null;
  export function occurrencesBetween(startDay: string, cadence: string, from: string, to: string, max?: number): string[];
  export function rollForward(startDay: string, cadence: string, today?: Date): string | null;
  export function monthlyEquivalent(amount: number | string, cadence: string): number;
  export function monthlyTotals(items: Array<Record<string, any>>): MonthlyTotals;
  export function fortnightWindow(today?: Date, offset?: number): Date[];
  export function offsetForDay(day: string, today?: Date): number;
  export function projectItems(items: Array<Record<string, any>>, from: string, to: string): Occurrence[];
  export function summarise(occurrences: Occurrence[]): WindowSummary;
  export function nextOccurrence(items: Array<Record<string, any>>, today?: Date): { date: string; merchant: string; kind: RecurringKind } | null;
  export function validateRecurringInput(body: unknown, opts?: { partial?: boolean }): { item: Partial<RecurringInput>; error?: undefined } | { error: string; item?: undefined };
  export function manualToRecurring(row: Record<string, any>, today?: Date): Record<string, any>;
  export function mergeRecurring(detected: Array<Record<string, any>>, rows: Array<Record<string, any>>, today?: Date): Array<Record<string, any>>;
  export function suggestKind(txn: Record<string, any>): RecurringKind;
  export function suggestNextDate(txnDay: string | undefined, cadence: string, today?: Date): string;
  export function creditCardPayments(txns: Array<Record<string, any>>, today?: Date, days?: number): CardPayment[];
}
