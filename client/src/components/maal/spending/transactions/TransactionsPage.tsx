import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeft, Check, Download, ListFilter, MoreVertical, Plus, Repeat, Scale, Search,
  SlidersHorizontal, Upload, X,
} from "lucide-react";
import { setTransactionCategory } from "@/lib/transactions-depth.functions";
import { AskSparkButton } from "@/components/maal/home/HomeCard";
import { signedCents } from "@/components/maal/home/format";
import { RulesModal } from "@/components/maal/transactions/RulesModal";
import {
  accountKey, activeFilterCount, datePresets, detailFlags, emptyFilters, exportFilename, fetchRange, filterTransactions,
  groupOf, presetFor, sortTransactions, summarise, transactionsToCsv, type SortKey, type TxnFilters,
} from "../../../../../../shared/transactions-list.mjs";
import { TransactionDetailMount } from "../transaction-detail/TransactionDetailMount";
import { BankSyncNotice } from "./BankSyncNotice";
import { AddTransactionDrawer } from "./AddTransactionDrawer";
import { ExportDialog } from "./ExportDialog";
import { FiltersDrawer } from "./FiltersDrawer";
import { RecurringView, ReconcileView } from "./SecondaryViews";
import { longDate, TransactionsTable } from "./TransactionsTable";
import { StatementImportDialog } from "./StatementImportDialog";
import { describeAccount, useTransactionsData, type Txn } from "./useTransactionsData";
import "@/components/maal/home/home.css";
import "./transactions.css";

type View = "list" | "recurring" | "reconcile";
type Toast = { tone: "ok" | "error"; text: string } | null;

/**
 * Transactions list (/app/transactions, redesign session 2, HEL-91..95):
 * search, filters, CSV export of the filtered rows, and manual add. The old
 * page's tools (CSV import, rules, recurring, reconciliation) live in the
 * More menu. Rows open the Transaction detail drawer via ?txn=<id>.
 *
 * Rows come from the date-ranged GET /api/v1/reports/transactions: the last
 * 3 years by default, or exactly the chosen date filter (capped at 3 years),
 * so search, filters and export see the whole range, not just the latest 500.
 */
export function TransactionsPage() {
  const search = new URLSearchParams(useLocation({ select: (location) => location.searchStr }));
  const navigate = useNavigate();
  const statementRequested = search.get("import") === "statement";
  const importRun = search.get("basiq") === "queued" ? search.get("import_run") : null;
  const bankSyncRunId = importRun && /^[1-9]\d{0,18}$/.test(importRun) ? importRun : null;
  const today = useMemo(() => new Date(), []);
  const [filters, setFilters] = useState<TxnFilters>(emptyFilters);
  const range = useMemo(() => fetchRange(filters, today), [filters.from, filters.to, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useTransactionsData(range.from, range.to);
  const { reload } = data;

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [view, setView] = useState<View>("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(statementRequested);
  const [toast, setToast] = useState<Toast>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (statementRequested) setImportOpen(true);
  }, [statementRequested]);

  function closeImport() {
    setImportOpen(false);
    if (statementRequested) {
      search.delete("import");
      void navigate({ to: "/app/transactions", search: Object.fromEntries(search), replace: true });
    }
  }

  const refresh = useCallback(async () => { await reload(); setVersion((v) => v + 1); }, [reload]);
  const say = (tone: "ok" | "error", text: string) => setToast({ tone, text });

  const flags = useMemo(() => detailFlags(data.rows), [data.rows]);
  const filtered = useMemo(() => filterTransactions(data.rows, filters), [data.rows, filters]);
  const sorted = useMemo(() => sortTransactions(filtered, sort.key, sort.dir), [filtered, sort]);
  const summary = useMemo(() => summarise(filtered), [filtered]);
  const nFilters = activeFilterCount(filters);
  const narrowing = nFilters > 0 || filters.query.trim() !== "";

  // Options for the filter drawer, with counts across all rows.
  const accountOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of data.rows) counts.set(accountKey(t), (counts.get(accountKey(t)) || 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ ...describeAccount(key, data.accounts), count }))
      .sort((a, b) => (a.key === "manual" ? 1 : b.key === "manual" ? -1 : a.label.localeCompare(b.label)));
  }, [data.rows, data.accounts]);
  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of data.rows) counts.set(groupOf(t), (counts.get(groupOf(t)) || 0) + 1);
    const names = new Set<string>([...data.groups.map((g) => g.group), ...counts.keys()]);
    return [...names].map((group) => ({ group, count: counts.get(group) || 0 }))
      .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
  }, [data.rows, data.groups]);

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" || key === "amount" ? "desc" : "asc" }));
  }

  async function onCategory(t: Txn, group: string, category: string) {
    const ok = await setTransactionCategory(Number(t.id), group, category || undefined);
    if (ok) { say("ok", `Moved “${t.description || "transaction"}” to ${category || group}.`); void refresh(); }
    else say("error", "Couldn’t change the category. Please try again.");
  }

  function doExport() {
    const csv = transactionsToCsv(sorted, { accountLabel: (t) => describeAccount(accountKey(t), data.accounts).label, flags });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(filters, today);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("ok", `Exported ${sorted.length.toLocaleString("en-AU")} transaction${sorted.length === 1 ? "" : "s"} as CSV.`);
  }

  const removeChip = (patch: Partial<TxnFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const chips = filterChips(filters, today, (k) => describeAccount(k, data.accounts).label, removeChip);
  // "No transactions yet" only without a date filter; a filtered empty range is a "no match".
  const empty = !data.loading && !data.error && data.rows.length === 0 && !filters.from && !filters.to;

  return (
    <div className="mh tx">
      <div className="mh-page tx-page">
        <h1 className="sr-only">Transactions</h1>

        {bankSyncRunId && <BankSyncNotice key={bankSyncRunId} runId={bankSyncRunId} onComplete={refresh} />}
        {toast && (
          <div className="tx-toast" data-tone={toast.tone} role={toast.tone === "error" ? "alert" : "status"}>
            {toast.tone === "ok" && <Check aria-hidden className="tx-toast-icon" />}
            <span className="flex-1">{toast.text}</span>
            <button type="button" className="tx-iconbtn" onClick={() => setToast(null)} aria-label="Dismiss"><X aria-hidden /></button>
          </div>
        )}

        <section className="mh-card tx-card" aria-labelledby="tx-card-label">
          <div className="mh-card-head tx-head">
            {view === "list" ? (
              <h2 className="mh-card-label m-0 font-normal" id="tx-card-label">Transactions</h2>
            ) : (
              <button type="button" className="mh-card-label tx-back" onClick={() => setView("list")} id="tx-card-label">
                <ArrowLeft aria-hidden /> {view === "recurring" ? "Recurring payments" : "Reconcile accounts"}
              </button>
            )}
            <div className="tx-tools">
              {view === "list" && !empty && (
                <>
                  <label className="tx-search">
                    <Search aria-hidden />
                    <span className="sr-only">Search transactions</span>
                    <input type="search" value={filters.query} placeholder="Search"
                      onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} />
                    {filters.query && (
                      <button type="button" className="tx-search-clear" aria-label="Clear search"
                        onClick={() => setFilters((f) => ({ ...f, query: "" }))}><X aria-hidden /></button>
                    )}
                  </label>
                  <button type="button" className="tx-toolbtn" onClick={() => setFiltersOpen(true)}
                    aria-label={nFilters ? `Filters, ${nFilters} on` : "Filters"} data-on={nFilters > 0}>
                    <ListFilter aria-hidden />
                    {nFilters > 0 && <span className="tx-badge" aria-hidden>{nFilters}</span>}
                  </button>
                </>
              )}
              <AskSparkButton label="Ask Maal about your transactions"
                question="Can you look over my recent transactions and point out anything unusual, any subscriptions I might have forgotten, and where my money is mostly going?" />
              <Menu.Root modal={false}>
                <Menu.Trigger className="tx-toolbtn" aria-label="More transaction options"><MoreVertical aria-hidden /></Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content align="end" sideOffset={6} className="mh-shell tx-menu">
                    <Menu.Item className="tx-menu-item" disabled={!data.rows.length} onSelect={() => setExportOpen(true)}><Download aria-hidden /> Export as CSV</Menu.Item>
                    <Menu.Item className="tx-menu-item" onSelect={() => setImportOpen(true)}>
                      <Upload aria-hidden /> Import CSV statement
                    </Menu.Item>
                    <Menu.Separator className="tx-menu-sep" />
                    <Menu.Item className="tx-menu-item" onSelect={() => setView("recurring")}><Repeat aria-hidden /> Recurring payments</Menu.Item>
                    <Menu.Item className="tx-menu-item" onSelect={() => setView("reconcile")}><Scale aria-hidden /> Reconcile accounts</Menu.Item>
                    <Menu.Item className="tx-menu-item" onSelect={() => setRulesOpen(true)}><SlidersHorizontal aria-hidden /> Categorisation rules</Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
              <button type="button" className="tx-add-btn" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden /><span className="tx-add-text">Add transaction</span>
              </button>
            </div>
          </div>

          {view === "recurring" ? <RecurringView version={version} /> : view === "reconcile" ? <ReconcileView /> : data.loading ? (
            <div className="tx-pad tx-stack">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="mh-skel" style={{ height: 40 }} />)}</div>
          ) : data.error && data.rows.length === 0 ? (
            <div className="mh-empty tx-pad" role="alert">
              <p className="m-0">Your transactions couldn’t load right now. {data.error}</p>
              <button type="button" className="mh-btn-outline mt-4" onClick={() => void refresh()}>Try again</button>
            </div>
          ) : empty ? (
            <div className="tx-empty">
              <p className="tx-empty-title">No transactions yet</p>
              <p className="tx-muted">Connect a bank and your transactions sync automatically. You can also import a CSV statement or add one by hand.</p>
              <div className="tx-empty-actions">
                <Link to="/app/accounts/connect" className="tx-btn-ink">Connect a bank</Link>
                <button type="button" className="tx-btn-line" onClick={() => setImportOpen(true)}>
                  <Upload aria-hidden /> Import CSV
                </button>
                <button type="button" className="tx-btn-line" onClick={() => setAddOpen(true)}><Plus aria-hidden /> Add transaction</button>
              </div>
              <p className="tx-muted tx-small">CSV columns: Date, Description, Amount. Dates as DD/MM/YYYY or YYYY-MM-DD.</p>
            </div>
          ) : (
            <>
              {data.error && <p className="tx-error tx-pad-x" role="alert">Couldn’t refresh: {data.error} Showing what was loaded earlier.</p>}
              {sorted.length > 0 && <dl className="tx-summary" aria-label="Summary of the transactions shown">
                <div><dt>Transactions</dt><dd>{summary.count.toLocaleString("en-AU")}</dd></div>
                <div className="tx-summary-range"><dt>Date range</dt><dd>{summary.from ? `${longDate(summary.from)} – ${longDate(summary.to)}` : "–"}</dd></div>
                <div><dt>Money out</dt><dd className="mh-amount">{signedCents(summary.moneyOut)}</dd></div>
                <div><dt>Money in</dt><dd className="mh-amount" data-in={summary.moneyIn > 0}>{signedCents(summary.moneyIn)}</dd></div>
              </dl>}
              {data.truncated && (
                <p className="tx-muted tx-small tx-pad-x" role="status">
                  {/* db/reports.js keeps the newest 20,000 rows of the range and drops the oldest. */}
                  Showing the most recent 20,000 transactions in this range — narrow the dates to see older ones.
                </p>
              )}
              {range.clamped && (
                <p className="tx-muted tx-small tx-pad-x" role="status">
                  Showing up to 3 years at a time, from {longDate(range.from)} to {longDate(range.to)}.
                </p>
              )}
              {chips.length > 0 && (
                <div className="tx-chips" aria-label="Filters in use">
                  {chips.map((c) => (
                    <button key={c.key} type="button" className="tx-filter-chip" onClick={c.remove} aria-label={`Remove filter: ${c.label}`}>
                      {c.label}<X aria-hidden />
                    </button>
                  ))}
                  <button type="button" className="tx-link tx-small" onClick={() => setFilters((f) => ({ ...emptyFilters(), query: f.query }))}>Clear all</button>
                </div>
              )}
              {sorted.length === 0 ? (
                <div className="mh-empty tx-pad">
                  <p className="m-0">No transactions match{filters.query ? ` “${filters.query}”` : ""}{nFilters ? " with these filters" : ""}.</p>
                  <button type="button" className="mh-btn-outline mt-4" onClick={() => setFilters(emptyFilters())}>Clear search and filters</button>
                </div>
              ) : (
                <TransactionsTable key={JSON.stringify(filters) + sort.key + sort.dir} rows={sorted} accounts={data.accounts}
                  groups={data.groups} sort={sort} onSort={onSort} onCategory={onCategory} query={filters.query} />
              )}
            </>
          )}
        </section>
      </div>

      <FiltersDrawer open={filtersOpen} onOpenChange={setFiltersOpen} value={filters} onApply={setFilters}
        accounts={accountOptions} groups={groupOptions} flags={flags} today={today} />
      <AddTransactionDrawer open={addOpen} onOpenChange={setAddOpen} groups={data.groups} accounts={data.accounts} today={today}
        onAdded={(msg) => { say("ok", msg); void refresh(); }} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} count={sorted.length} filtered={narrowing}
        onExport={doExport} onOpenFilters={() => { setExportOpen(false); setFiltersOpen(true); }} />
      {importOpen && <StatementImportDialog onClose={closeImport} onImport={(result) => {
        closeImport();
        say(result.ok ? "ok" : "error", result.message);
        void refresh();
      }} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} onApplied={() => void refresh()} />}
      <TransactionDetailMount onChanged={() => void refresh()} />
    </div>
  );
}

/** Removable chips for each active filter. */
function filterChips(f: TxnFilters, today: Date, accountLabel: (k: string) => string, remove: (p: Partial<TxnFilters>) => void) {
  const out: Array<{ key: string; label: string; remove: () => void }> = [];
  if (f.from || f.to) {
    const id = presetFor(f.from, f.to, today);
    const label = id === "custom"
      ? (f.from ? `${longDate(f.from)} – ${f.to ? longDate(f.to) : "today"}` : `3 years to ${longDate(f.to as string)}`)
      : datePresets(today).find((p) => p.id === id)?.label || "Date";
    out.push({ key: "date", label, remove: () => remove({ from: null, to: null }) });
  }
  for (const a of f.accounts) out.push({ key: `a:${a}`, label: accountLabel(a), remove: () => remove({ accounts: f.accounts.filter((x) => x !== a) }) });
  for (const g of f.groups) out.push({ key: `g:${g}`, label: g, remove: () => remove({ groups: f.groups.filter((x) => x !== g) }) });
  if (f.min != null || f.max != null) {
    out.push({ key: "amt", label: `$${f.min ?? 0} – ${f.max != null ? `$${f.max}` : "any"}`, remove: () => remove({ min: null, max: null }) });
  }
  if (f.type !== "all") out.push({ key: "type", label: f.type === "expense" ? "Money out" : "Money in", remove: () => remove({ type: "all" }) });
  if (f.visibility !== "all") out.push({ key: "vis", label: f.visibility === "hidden" ? "Hidden only" : "Visible only", remove: () => remove({ visibility: "all" }) });
  if (f.review !== "all") out.push({ key: "rev", label: f.review === "reviewed" ? "Reviewed" : "Not reviewed", remove: () => remove({ review: "all" }) });
  return out;
}
