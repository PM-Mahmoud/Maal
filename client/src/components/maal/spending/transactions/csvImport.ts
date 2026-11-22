import { addTransaction } from "@/lib/transactions.functions";
import { parseStatementCsv, rowFingerprint } from "../../../../../../shared/transactions-list.mjs";

// Retry-safety for CSV imports without a bulk endpoint (behaviour kept from
// the old page): fingerprints of rows that imported are remembered in this
// browser, so re-uploading the same file after a partial failure skips them.
// (Trade-off: two genuinely identical transactions on the same day import once.)
const IMPORTED_KEY = "maal_csv_imported_v1";
const MAX_IMPORTED_KEYS = 5000;

function loadImportedKeys(): Set<string> {
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

/** Validate the whole file first, then POST each new row. Returns a message for the toast. */
export async function importStatementFile(file: File): Promise<ImportOutcome> {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    return { ok: false, message: "PDF statements aren’t supported yet. Export a CSV (Date, Description, Amount) from your bank and upload that." };
  }
  const parsed = parseStatementCsv(await file.text());
  if (parsed.error !== undefined) return { ok: false, message: parsed.error };

  const seen = loadImportedKeys();
  let inserted = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const fp = rowFingerprint(row);
    if (seen.has(fp)) { skipped++; continue; }
    try {
      await addTransaction({ data: { ...row, category: "other" } });
      seen.add(fp);
      inserted++;
    } catch (err: any) {
      failures.push(`row ${i + 1} (${row.description.slice(0, 24)}): ${err?.message ?? "save failed"}`);
    }
  }
  saveImportedKeys(seen);

  const total = parsed.rows.length;
  const plural = (n: number) => (n === 1 ? "" : "s");
  const skippedNote = skipped ? ` (${skipped} already imported, skipped)` : "";
  if (failures.length) {
    return {
      ok: false,
      message: `Imported ${inserted} of ${total} row${plural(total)}${skippedNote}. Failed: ${failures.slice(0, 3).join("; ")}`
        + `${failures.length > 3 ? ` (+${failures.length - 3} more)` : ""}. Upload the same file again to retry; rows already imported are skipped.`,
    };
  }
  if (inserted === 0 && skipped > 0) {
    return { ok: true, message: `All ${skipped} row${plural(skipped)} from ${file.name} ${skipped === 1 ? "was" : "were"} already imported. Nothing new to add.` };
  }
  return { ok: true, message: `Imported ${inserted} row${plural(inserted)} from ${file.name}${skippedNote}.` };
}
