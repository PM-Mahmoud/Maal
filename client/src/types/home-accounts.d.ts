// Types for shared/home-accounts.mjs (pure Home dashboard money math).
declare module "*home-accounts.mjs" {
  export type HomeCategory = "cash" | "investments" | "super" | "other" | "debts";
  export type HomeAccountKind = "cash" | "investment" | "super" | "property" | "debt" | "other";
  export type HomeAccount = {
    id: string;
    kind: HomeAccountKind;
    name: string;
    institution: string | null;
    categories: Record<HomeCategory, number>;
    balance: number;
    reference?: string | null;
  };
  export type HomeTotals = Record<HomeCategory, number> & { netWorth: number };
  export type SeriesPoint = { date: string; value: number };
  export type HomeRange = "1W" | "1M" | "3M" | "YTD" | "ALL";
  type Row = Record<string, unknown>;

  export const RANGES: HomeRange[];
  export function buildHomeAccounts(rows: {
    cash?: Row[]; investments?: Row[]; super?: Row[]; properties?: Row[]; debts?: Row[]; other?: Row[];
  }): HomeAccount[];
  export function filteredTotals(accounts: HomeAccount[], selectedIds?: string[] | null): HomeTotals;
  export function categoryRatios(accounts: HomeAccount[], selectedIds?: string[] | null): Record<HomeCategory, number>;
  export function isPartialSelection(accounts: HomeAccount[], selectedIds: string[] | null): boolean;
  export function filteredSeries(
    snapshots: Array<{ date: string; netWorth: number; assets: number; cash: number; investments: number; super: number; debts: number }>,
    accounts: HomeAccount[],
    selectedIds?: string[] | null,
  ): SeriesPoint[];
  export function rangeStart(range: HomeRange, now?: Date): string | null;
  export function sliceSeries(series: SeriesPoint[], range: HomeRange, now?: Date): SeriesPoint[];
  export function seriesChange(series: Array<{ value: number }>): { change: number; pct: number | null };
  export function holdingReturn(value: unknown, costBasis: unknown): { gain: number | null; pct: number | null };
  export function monthSpending(
    transactions: Array<Record<string, unknown>>,
    year: number,
    month: number,
    today?: Date,
  ): { total: number; byDay: Array<number | null> };
}
