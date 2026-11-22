// Types for shared/transaction-splits.mjs (pure split + hidden-row maths).
declare module "*transaction-splits.mjs" {
  type Txn = Record<string, any>;
  export type SplitPart = { amount: number | string; category_group: string; category?: string | null; hidden?: boolean };
  export type SplitValidation = {
    ok: boolean;
    error: string | null;
    partErrors: Array<string | undefined>;
    parts: Array<{ amount: number; category_group: string; category: string | null; hidden: boolean }>;
  };
  export const MAX_SPLITS: number;
  export const MIN_SPLITS: number;
  export function parseMoney(v: unknown): number;
  export function toCents(v: unknown): number;
  export function equalSplit(total: number | string, n: number): number[];
  export function remainingCents(total: number | string, parts: Array<{ amount: unknown }>): number;
  export function validateSplits(total: number | string, parts: SplitPart[]): SplitValidation;
  export function effectiveTransactions<T extends Txn>(rows: T[] | null | undefined): T[];
}
