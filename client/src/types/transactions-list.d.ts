// Types for shared/transactions-list.mjs (Transactions list: search, filters, export, add).
declare module "*transactions-list.mjs" {
  type Txn = Record<string, any>;
  export type TxnFilters = {
    query: string;
    from: string | null;
    to: string | null;
    accounts: string[];
    groups: string[];
    min: number | null;
    max: number | null;
    type: "all" | "expense" | "income";
    visibility: "all" | "visible" | "hidden";
    review: "all" | "reviewed" | "unreviewed";
  };
  export type SortKey = "date" | "amount" | "category" | "merchant";
  export type TxnSummary = { count: number; from: string | null; to: string | null; moneyIn: number; moneyOut: number; net: number };
  export type DatePreset = { id: string; label: string; from: string | null; to: string | null };
  export type ImportRow = { occurred_on: string; description: string; amount: number };
  export type ManualForm = { type: "expense" | "income"; description: string; amount: string | number; date: string; group?: string; category?: string };
  export type ManualResult =
    | { ok: true; body: ImportRow; category: { group: string; category?: string } | null }
    | { ok: false; errors: Partial<Record<"description" | "amount" | "date", string>> };

  export const MAX_MANUAL_AMOUNT: number;
  export function amountOf(t: Txn): number;
  export function isoDate(d: Date): string;
  export function dayOf(t: Txn): string | null;
  export function groupOf(t: Txn): string;
  export function accountKey(t: Txn): string;
  export function isHidden(t: Txn): boolean;
  export function isReviewed(t: Txn): boolean;
  export function detailFlags(rows: Txn[]): { hidden: boolean; reviewed: boolean };
  export function emptyFilters(): TxnFilters;
  export function activeFilterCount(f: TxnFilters): number;
  export function matchesSearch(t: Txn, query: string): boolean;
  export function filterTransactions<T extends Txn>(rows: T[], f: Partial<TxnFilters>): T[];
  export function sortTransactions<T extends Txn>(rows: T[], key?: SortKey, dir?: "asc" | "desc"): T[];
  export function summarise(rows: Txn[]): TxnSummary;
  export function fyStartYear(d: Date): number;
  export function datePresets(today?: Date): DatePreset[];
  export function presetFor(from: string | null, to: string | null, today?: Date): string;
  export const MAX_RANGE_DAYS: number;
  export function addDays(day: string, n: number): string;
  export function rangeError(from: string | null, to: string | null, today?: Date): string | null;
  export function fetchRange(filters: Partial<TxnFilters> | null | undefined, today?: Date): { from: string; to: string; clamped: boolean };
  export function csvCell(value: unknown, opts?: { text?: boolean }): string;
  export function transactionsToCsv(rows: Txn[], opts?: { accountLabel?: (t: Txn) => string; flags?: { hidden: boolean; reviewed: boolean } }): string;
  export function exportFilename(filters: Partial<TxnFilters>, today?: Date): string;

  export function parseDateCell(raw: string): string | null;
  export function parseAmountCell(raw: string): number | null;
  export function parseStatementCsv(text: string): { rows: ImportRow[]; error?: undefined } | { error: string; rows?: undefined };
  export type StatementColumns = Record<"date" | "description" | "amount" | "debit" | "credit", number>;
  export function parseCsv(text: string, options?: { rejectUnclosedQuotes?: boolean }): string[][];
  export function statementColumns(cells: string[] | undefined, hasHeader: boolean): StatementColumns;
  export function parseMappedStatement(cells: string[][], mapping: { hasHeader: boolean; columns: StatementColumns; split: boolean }):
    { rows: ImportRow[]; error?: undefined } | { error: string; rows?: undefined };
  export function previewStatementRows(rows: ImportRow[], priorKeys?: Iterable<string>): { rows: ImportRow[]; skipped: number };
  export function rowFingerprint(r: ImportRow): string;
  export function buildManualTransaction(form: ManualForm, today?: Date): ManualResult;
}
