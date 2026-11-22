import { Share } from "lucide-react";
import { TxDialog } from "./TxDrawer";

/**
 * Export as CSV (HEL-94). The file is built in the browser from the rows the
 * user is looking at (their own rows from GET /api/v1/transactions, after
 * search + filters), so nothing extra is fetched or sent anywhere.
 */
export function ExportDialog({ open, onOpenChange, count, filtered, onExport, onOpenFilters }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** True when search or any filter is narrowing the list. */
  filtered: boolean;
  onExport: () => void;
  onOpenFilters: () => void;
}) {
  return (
    <TxDialog open={open} onOpenChange={onOpenChange} title="Export transactions">
      <p className="tx-dialog-text">
        {filtered
          ? <>Your export will include the <strong>{count.toLocaleString("en-AU")}</strong> transaction{count === 1 ? "" : "s"} that match your current search and filters.</>
          : <>No filters are applied, so your export will include all <strong>{count.toLocaleString("en-AU")}</strong> transaction{count === 1 ? "" : "s"}. To narrow it down, <button type="button" className="tx-link" onClick={onOpenFilters}>set filters</button> first.</>}
      </p>
      <button type="button" className="tx-btn-soft" disabled={count === 0} onClick={() => { onExport(); onOpenChange(false); }}>
        <Share aria-hidden /> Export as CSV
      </button>
      {count === 0 && <p className="tx-muted tx-small tx-center">There’s nothing to export with these filters.</p>}
    </TxDialog>
  );
}
