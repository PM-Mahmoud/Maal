import { addTransaction } from "@/lib/transactions.functions";
import { parseCsv, previewStatementRows, rowFingerprint, type ImportRow } from "../../../../../../shared/transactions-list.mjs";

// Retry-safety for CSV imports without a bulk endpoint (behaviour kept from
// the old page): fingerprints of rows that imported are remembered in this
// browser, so re-uploading the same file after a partial failure skips them.
// (Trade-off: two genuinely identical transactions on the same day import once.)
const IMPORTED_KEY = "maal_csv_imported_v1";
const MAX_IMPORTED_KEYS = 5000;

export function loadImportedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch { return new Set(); }
}
function saveImportedKeys(keys: Set<string>): void {
  try { localStorage.setItem(IMPORTED_KEY, JSON.stringify(Array.from(keys).slice(-MAX_IMPORTED_KEYS))); }
  catch { /* storage blocked or full; non-fatal */ }
}

export type ImportOutcome = { ok: boolean; message: string };

export async function readStatementFile(file: File): Promise<string[][]> {
  if (!/\.csv$/i.test(file.name)) {
    throw new Error("Upload a CSV statement exported by your bank.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a CSV up to 5 MB.");
  }
  const rows = parseCsv((await file.text()).trimStart(), { rejectUnclosedQuotes: true });
  if (!rows.length) {
    throw new Error("The CSV is empty.");
  }
  if (rows.length > MAX_IMPORTED_KEYS) {
    throw new Error("Split the statement into CSV files of up to 5,000 rows.");
  }
  return rows;
}

/** Add only new rows using the existing per-transaction API. */
export async function importStatementRows(rows: ImportRow[]): Promise<ImportOutcome> {
  const seen = loadImportedKeys();
  const preview = previewStatementRows(rows, seen);
  let inserted = 0;
  for (const row of preview.rows) {
    try {
      await addTransaction({ data: { ...row, category: "other" } });
      seen.add(rowFingerprint(row));

      inserted++;
    } catch {
      // Keep saving subsequent rows. Retry will skip those already saved.
    }
  }

  saveImportedKeys(seen);
  const skipped = preview.skipped;
  const failed = preview.rows.length - inserted;
  const skipMessage = skipped ? ` ${skipped} duplicate ${skipped === 1 ? "row was" : "rows were"} skipped.` : "";
  const summary = `Imported ${inserted} ${inserted === 1 ? "transaction" : "transactions"}.${skipMessage}`;
  if (failed) {
    return {
      ok: false,
      message: `${summary} ${failed} ${failed === 1 ? "row couldn’t" : "rows couldn’t"} be saved. Review the file again to retry.`,
    };
  }
  return { ok: true, message: summary };
}
