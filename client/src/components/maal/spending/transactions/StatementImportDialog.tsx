import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  parseMappedStatement, previewStatementRows, statementColumns,
  type ImportRow, type StatementColumns,
} from "../../../../../../shared/transactions-list.mjs";
import { signedCents } from "@/components/maal/home/format";
import { importStatementRows, loadImportedKeys, readStatementFile, type ImportOutcome } from "./csvImport";
import { TxDialog } from "./TxDrawer";
import { longDate } from "./TransactionsTable";

const FIELD_LABELS = { date: "Date", description: "Description", amount: "Amount", debit: "Debit", credit: "Credit" };
type Field = keyof StatementColumns;
type Statement = { name: string; cells: string[][] };

export function StatementImportDialog({ onClose, onImport }: {
  onClose: () => void;
  onImport: (outcome: ImportOutcome) => void;
}) {
  const [statement, setStatement] = useState<Statement>();
  const [columns, setColumns] = useState(statementColumns(undefined, false));
  const [hasHeader, setHasHeader] = useState(false);
  const [split, setSplit] = useState(false);
  const [preview, setPreview] = useState<{ sourceRows: ImportRow[]; rows: ImportRow[]; skipped: number }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const cells = await readStatementFile(file);
      const suggested = statementColumns(cells[0], true);
      const header = suggested.date >= 0;
      const mapping = header ? suggested : statementColumns(undefined, false);
      setStatement({ name: file.name, cells });
      setHasHeader(header);
      setColumns(mapping);
      setSplit(mapping.amount < 0 && mapping.debit >= 0 && mapping.credit >= 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn’t read the CSV.");
    } finally {
      setBusy(false);
    }
  }

  function showPreview() {
    if (!statement) return;
    setError("");
    const mapped = parseMappedStatement(statement.cells, { hasHeader, columns, split });
    if (mapped.error !== undefined) {
      setError(mapped.error);
      return;
    }
    setPreview({ sourceRows: mapped.rows, ...previewStatementRows(mapped.rows, loadImportedKeys()) });
  }

  async function confirm() {
    if (!preview || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await importStatementRows(preview.sourceRows);
      onImport(result);
    } finally {
      saving.current = false;
    }
  }

  const fields: Field[] = split ? ["date", "description", "debit", "credit"] : ["date", "description", "amount"];
  const title = preview ? "Preview transactions" : statement ? "Match your columns" : "Import a statement";

  return (
    <TxDialog open onOpenChange={(open) => { if (!open && !saving.current) onClose(); }} title={title}>
      {!statement ? (
        <>
          <p className="tx-dialog-text">Choose a CSV exported by your bank. You’ll review the transactions before adding them.</p>
          <label className="tx-field">
            <span className="tx-field-label">CSV statement</span>
            <input type="file" className="tx-import-file" accept=".csv,text/csv" disabled={busy} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void upload(file);
            }} />
          </label>
        </>
      ) : preview ? (
        <>
          <p className="tx-dialog-text" role="status">
            {preview.rows.length.toLocaleString("en-AU")} {preview.rows.length === 1 ? "transaction" : "transactions"} to import.
            {preview.skipped > 0 && ` ${preview.skipped} matching ${preview.skipped === 1 ? "row will" : "rows will"} be skipped.`}
          </p>
          {preview.rows.length > 0 && (
            <table className="tx-import-preview">
              <caption className="sr-only">First {Math.min(preview.rows.length, 10)} transactions to import</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Amount</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 10).map((row, index) => (
                  <tr key={index}>
                    <td>{longDate(row.occurred_on)}</td>
                    <td>{row.description}</td>
                    <td>{signedCents(Math.round(row.amount * 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.rows.length > 10 && <p className="tx-muted tx-small">Showing the first 10 transactions.</p>}
          <button type="button" className="tx-btn-ink" onClick={() => void confirm()} disabled={busy || !preview.rows.length}>
            {busy ? "Importing…" : "Confirm import"}
          </button>
          <button type="button" className="tx-btn-line" onClick={() => setPreview(undefined)} disabled={busy}>Back to column matching</button>
        </>
      ) : (
        <>
          <p className="tx-dialog-text tx-import-filename">{statement.name}</p>
          <label className="tx-import-check">
            <input type="checkbox" checked={hasHeader} onChange={(event) => {
              const checked = event.currentTarget.checked;
              setHasHeader(checked);
              setColumns(statementColumns(statement.cells[0], checked));
              setError("");
            }} />
            The first row contains column names
          </label>
          <label className="tx-field">
            <span className="tx-field-label">Amount format</span>
            <span className="tx-select">
              <select value={split ? "split" : "signed"} onChange={(event) => { setSplit(event.target.value === "split"); setError(""); }}>
                <option value="signed">One amount column</option>
                <option value="split">Separate debit and credit columns</option>
              </select>
              <ChevronDown aria-hidden />
            </span>
          </label>
          <div className="tx-import-columns">
            {fields.map((field) => (
              <label key={field} className="tx-field">
                <span className="tx-field-label">{FIELD_LABELS[field]} column</span>
                <span className="tx-select">
                  <select value={columns[field]} onChange={(event) => {
                    setColumns({ ...columns, [field]: Number(event.target.value) });
                    setError("");
                  }}>
                    <option value={-1}>Choose a column</option>
                    {statement.cells[0].map((cell, index) => (
                      <option key={index} value={index}>Column {index + 1}{cell.trim() ? ` · ${cell.trim().slice(0, 60)}` : ""}</option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden />
                </span>
              </label>
            ))}
          </div>
          <button type="button" className="tx-btn-ink" onClick={showPreview}>Preview transactions</button>
          <button type="button" className="tx-btn-line" onClick={() => { setStatement(undefined); setError(""); }}>Choose a different file</button>
        </>
      )}
      {error && <p role="alert" className="tx-field-error">{error}</p>}
    </TxDialog>
  );
}
