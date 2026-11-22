import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, BarChart3, CalendarRange, ChevronDown, GitFork, ListFilter, PieChart, SquareSplitVertical } from "lucide-react";
import {
  activeFilterCount, applyFilters, breakdown, cashFlowByPeriod, cashFlowTotals, emptyFilters, periodChanges,
  presetLabel, resolveRange, sameConfig, stackedByPeriod, suggestViewName, totalsOf, transfersByPeriod,
} from "../../../../../../shared/spending-reports.mjs";
import type { Kind, ReportTab, ViewBy } from "../../../../../../shared/spending-reports.mjs";
import { sankeyFlows } from "../../../../../../shared/spending-overview.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import { iconForGroup } from "../overview/categoryIcons";
import { createView, deleteView, updateView, type ChartType, type ReportConfig, type SavedView } from "./api";
import { Donut, PeriodBars, Sankey, rampAt, type BarsInput } from "./charts";
import { FiltersDialog, type FilterDraft } from "./FiltersDialog";
import { PER, PERIOD_NOUN, longLabel, rangeText, shortLabel } from "./labels";
import { ConfirmDeleteDialog, NameDialog, SavedReportsCard } from "./SavedReports";
import { useExcludedGroups, useReportTransactions, useSavedViews } from "./useReportData";
import "@/components/maal/home/home.css";
import "../overview/overview.css";
import "./reports.css";

const TABS: Array<{ tab: ReportTab; label: string }> = [
  { tab: "cashflow", label: "Cash flow" },
  { tab: "expenses", label: "Expenses" },
  { tab: "income", label: "Income" },
  { tab: "transfers", label: "Transfers" },
];
const KIND: Record<Exclude<ReportTab, "cashflow">, Kind> = { expenses: "expense", income: "income", transfers: "transfer" };
const NOUN: Record<Exclude<ReportTab, "cashflow">, string> = { expenses: "expenses", income: "income", transfers: "transfers" };
const CHARTS: Record<"cashflow" | "other", Array<{ v: ChartType; label: string; Icon: typeof BarChart3 }>> = {
  cashflow: [
    { v: "net", label: "Net cash flow", Icon: SquareSplitVertical },
    { v: "split", label: "Income and expenses", Icon: BarChart3 },
    { v: "flow", label: "Where your money flows", Icon: GitFork },
  ],
  other: [
    { v: "bars", label: "By period", Icon: BarChart3 },
    { v: "donut", label: "Breakdown", Icon: PieChart },
  ],
};

export const DEFAULT_CONFIG: ReportConfig = {
  tab: "cashflow", chart: "net", interval: "month", viewBy: "category", range: { preset: "6m" }, filters: emptyFilters(),
};

const signedAud = (n: number) => (n < 0 ? `-${aud(Math.abs(n))}` : aud(n));
type Sort = { col: number; dir: "asc" | "desc" };

/**
 * Spending → Reports (/app/spending/reports, redesign session 2, HEL-106/107).
 * Cash flow / expenses / income / transfers over any date range (presets or
 * custom, up to 3 years), grouped by week, month or quarter, filtered by
 * category and merchant; saved views on the right. Data: the date-ranged
 * GET /api/v1/reports/transactions; maths: shared/spending-reports.mjs.
 */
export function ReportsPage() {
  const today = useMemo(() => new Date(), []);
  const privacy = usePrivacy();
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const saved = useSavedViews();
  const { excluded } = useExcludedGroups();

  const range = resolveRange(config.range, today) ?? resolveRange({ preset: "6m" }, today)!;
  const data = useReportTransactions(range.from, range.to);
  const filtered = useMemo(() => applyFilters(data.transactions, config.filters, range.from, range.to),
    [data.transactions, config.filters, range.from, range.to]);
  const filterCount = activeFilterCount(config.filters);
  const isCash = config.tab === "cashflow";
  const kind = isCash ? null : KIND[config.tab as Exclude<ReportTab, "cashflow">];
  const noun = isCash ? "cash flow" : NOUN[config.tab as Exclude<ReportTab, "cashflow">];

  // ---------- Aggregates ----------
  const cash = useMemo(() => (isCash ? cashFlowByPeriod(filtered, range.from, range.to, config.interval, excluded) : []),
    [isCash, filtered, range.from, range.to, config.interval, excluded]);
  const stacked = useMemo(() => (kind ? stackedByPeriod(filtered, kind, range.from, range.to, config.interval, config.viewBy, excluded, 5) : null),
    [kind, filtered, range.from, range.to, config.interval, config.viewBy, excluded]);
  const share = useMemo(() => (kind ? breakdown(filtered, kind, config.viewBy, excluded) : null),
    [kind, filtered, config.viewBy, excluded]);
  const transfers = useMemo(() => (config.tab === "transfers" ? transfersByPeriod(filtered, range.from, range.to, config.interval) : []),
    [config.tab, filtered, range.from, range.to, config.interval]);
  const flows = useMemo(() => (isCash && config.chart === "flow"
    ? sankeyFlows(filtered, range.from.slice(0, 7), range.to.slice(0, 7), excluded, config.viewBy) : null),
  [isCash, config.chart, filtered, range.from, range.to, excluded, config.viewBy]);

  const periodsList = isCash ? cash : stacked?.rows ?? [];
  const crossYear = periodsList.length > 0 && periodsList[0].key.slice(0, 4) !== periodsList[periodsList.length - 1].key.slice(0, 4);
  const xLabels = periodsList.map((p, i) => shortLabel(p, config.interval, i, crossYear));
  const rText = rangeText(range.from, range.to);

  const hasAny = data.transactions.length > 0;
  const hasKind = isCash ? cash.some((r) => r.income || r.expenses) : (share?.rows.length ?? 0) > 0;

  // ---------- Saved views ----------
  const activeView = saved.views.find((v) => v.id === activeId) ?? null;
  const dirty = !!activeView && !sameConfig(activeView.config, config);
  const [nameDialog, setNameDialog] = useState<{ mode: "save" | "rename"; view?: SavedView } | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SavedView | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  function update(patch: Partial<ReportConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
  }
  function setTab(tab: ReportTab) {
    const valid = tab === "cashflow" ? ["net", "split", "flow"] : ["bars", "donut"];
    setConfig((c) => ({ ...c, tab, chart: valid.includes(c.chart) ? c.chart : (tab === "cashflow" ? "net" : "bars") }));
    setSort(null);
  }
  function openView(v: SavedView) {
    setConfig({ ...DEFAULT_CONFIG, ...v.config, filters: { ...emptyFilters(), ...(v.config.filters || {}) } });
    setActiveId(v.id);
    setSort(null);
  }
  async function submitName(name: string) {
    if (!nameDialog) return;
    setNameBusy(true);
    setNameError(null);
    try {
      if (nameDialog.mode === "save") {
        const v = await createView(name, config);
        saved.setViews((list) => [...list, v]);
        setActiveId(v.id);
        toast.success("Report saved");
      } else if (nameDialog.view) {
        const v = await updateView(nameDialog.view.id, { name });
        saved.setViews((list) => list.map((x) => (x.id === v.id ? v : x)));
        toast.success("Report renamed");
      }
      setNameDialog(null);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setNameBusy(false); }
  }
  async function updateActive(v: SavedView) {
    try {
      const nv = await updateView(v.id, { config });
      saved.setViews((list) => list.map((x) => (x.id === nv.id ? nv : x)));
      toast.success("Report updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update this report."); }
  }
  async function confirmDelete() {
    if (!toDelete) return;
    setDelBusy(true);
    try {
      await deleteView(toDelete.id);
      saved.setViews((list) => list.filter((x) => x.id !== toDelete.id));
      if (activeId === toDelete.id) setActiveId(null);
      toast.success("Report deleted");
      setToDelete(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete this report."); }
    finally { setDelBusy(false); }
  }

  const draft: FilterDraft = useMemo(() => ({ range: config.range, interval: config.interval, filters: config.filters }),
    [config.range, config.interval, config.filters]);

  const groupsText = config.filters.groups.length ? ` in ${config.filters.groups.join(", ")}` : "";
  const askQuestion = `Looking at my ${noun}${groupsText} from ${rText}, what stands out, what's driving it, and what could I change?`;

  // ---------- Chart ----------
  let chart: ReactNode = null;
  if (isCash && config.chart === "flow" && flows) {
    chart = <Sankey flows={flows} privacy={privacy} rangeText={rText} />;
  } else if (isCash) {
    const input: BarsInput = config.chart === "split"
      ? { mode: "split", pairs: cash.map((r) => [r.income, r.expenses]), legend: ["Income", "Expenses"] }
      : { mode: "net", values: cash.map((r) => r.net) };
    const label = config.chart === "split" ? "Income and expenses" : "Net cash flow";
    const summary = privacy ? `${label}, ${rText}: amounts hidden`
      : `${label}, ${rText}: ${cash.map((r, i) => `${xLabels[i]} ${config.chart === "split" ? `income ${aud(r.income)}, expenses ${aud(r.expenses)}` : signedAud(r.net)}`).join("; ")}`;
    chart = <PeriodBars data={input} labels={xLabels} summary={summary} />;
  } else if (stacked && share && config.chart === "donut") {
    const top = breakdown(filtered, kind!, config.viewBy, excluded, 6);
    const summary = privacy ? `${noun} breakdown: amounts hidden`
      : `${noun} by ${config.viewBy}, ${rText}: ${top.rows.map((r) => `${r.label} ${aud(r.amount)} (${r.pct.toFixed(1)}%)`).join(", ")}`;
    chart = <Donut rows={top.rows} total={top.total} caption={`Total ${noun}`} summary={summary} />;
  } else if (stacked) {
    const summary = privacy ? `${noun} by ${PERIOD_NOUN[config.interval].toLowerCase()}: amounts hidden`
      : `${noun} by ${PERIOD_NOUN[config.interval].toLowerCase()}, ${rText}: ${stacked.rows.map((r, i) => `${xLabels[i]} ${aud(r.total)}`).join("; ")}`;
    chart = <PeriodBars data={{ mode: "stack", stacks: stacked.rows.map((r) => r.segments), legend: stacked.labels }} labels={xLabels} summary={summary} />;
  }

  // ---------- Strip ----------
  let strip: Array<[string, string]> = [];
  if (isCash) {
    const s = cashFlowTotals(cash);
    strip = [["Total income", aud(s.income)], ["Total expenses", aud(s.expenses)], ["Net cash flow", signedAud(s.net)], [`Avg cash flow / ${PER[config.interval]}`, signedAud(s.avgPerPeriod)]];
  } else if (config.tab === "transfers") {
    const out = transfers.reduce((a, r) => a + Math.round(r.moneyOut * 100), 0) / 100;
    const inn = transfers.reduce((a, r) => a + Math.round(r.moneyIn * 100), 0) / 100;
    strip = [["Moved out", aud(out)], ["Moved in", aud(inn)]];
  } else if (stacked) {
    const t = totalsOf(stacked.rows.map((r) => r.total));
    strip = [[`Total ${noun}`, aud(t.total)], [`Avg ${noun} / ${PER[config.interval]}`, aud(t.avgPerPeriod)]];
  }

  // ---------- Table ----------
  type Row = { key: string; first: ReactNode; firstSort: string | number; cells: Array<{ node: ReactNode; sort: number }> };
  let head: string[] = [];
  let rows: Row[] = [];
  let firstIsPeriod = true;
  if (isCash) {
    head = [PERIOD_NOUN[config.interval], "Income", "Expenses", "Net cash flow"];
    rows = cash.map((r) => ({
      key: r.key, first: longLabel(r, config.interval, today), firstSort: r.key,
      cells: [{ node: aud(r.income), sort: r.income }, { node: aud(r.expenses), sort: r.expenses }, { node: signedAud(r.net), sort: r.net }],
    }));
  } else if (share && config.chart === "donut") {
    firstIsPeriod = false;
    head = [config.viewBy === "merchant" ? "Merchants" : "Categories", cap(noun), `% of ${noun}`];
    rows = share.rows.map((r, i) => {
      const Icon = iconForGroup(r.group);
      return {
        key: r.label,
        firstSort: r.label,
        first: (
          <span className="rp-cat">
            {config.viewBy === "merchant"
              ? <i className="rp-swatch" style={{ opacity: rampAt(i) }} aria-hidden />
              : <span className="rp-cat-icon" aria-hidden><Icon /></span>}
            <span className="rp-cat-name">{r.label}</span>
          </span>
        ),
        cells: [{ node: aud(r.amount), sort: r.amount }, { node: `${r.pct.toFixed(2)}%`, sort: r.pct }],
      };
    });
  } else if (stacked) {
    const totals = stacked.rows.map((r) => r.total);
    const changes = periodChanges(totals);
    head = [PERIOD_NOUN[config.interval], cap(noun), `Change vs previous ${PERIOD_NOUN[config.interval].toLowerCase()}`];
    rows = stacked.rows.map((r, i) => ({
      key: r.key, first: longLabel(r, config.interval, today), firstSort: r.key,
      cells: [{ node: aud(r.total), sort: r.total }, { node: <Change pct={changes[i]} tab={config.tab} />, sort: changes[i] ?? -Infinity }],
    }));
  }
  // Period tables default to newest first; breakdown tables to the biggest first.
  const sortBy: Sort = sort ?? (firstIsPeriod ? { col: 0, dir: "desc" } : { col: 1, dir: "desc" });
  {
    const dir = sortBy.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sortBy.col === 0) return (a.firstSort < b.firstSort ? -1 : a.firstSort > b.firstSort ? 1 : 0) * dir;
      return ((a.cells[sortBy.col - 1]?.sort ?? 0) - (b.cells[sortBy.col - 1]?.sort ?? 0)) * dir;
    });
  }
  function toggleSort(col: number) {
    setSort(sortBy.col === col ? { col, dir: sortBy.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" });
  }

  const charts = CHARTS[isCash ? "cashflow" : "other"];
  const showViewBy = !isCash || config.chart === "flow";

  return (
    <div className="mh so rp">
      <div className="mh-page rp-page">
        <h1 className="sr-only">Spending reports</h1>
        <div className="mh-grid rp-grid">
          <div className="mh-col">
            <HomeCard label="Reports" labelId="rp-label" className="rp-card" bodyClassName="rp-card-body"
              actions={(
                <>
                  <button type="button" className="rp-filter-btn" onClick={() => setFiltersOpen(true)}
                    aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters and date range"} title="Filters and date range">
                    <ListFilter aria-hidden />
                    {filterCount > 0 && <span className="rp-badge" aria-hidden>{filterCount}</span>}
                  </button>
                  <AskSparkButton label="Ask Maal about this report" question={askQuestion} />
                </>
              )}>
              <div className="so-tabs rp-tabs" role="tablist" aria-label="Report type">
                {TABS.map(({ tab, label }) => (
                  <button key={tab} type="button" role="tab" id={`rp-tab-${tab}`} aria-selected={config.tab === tab}
                    aria-controls="rp-panel" onClick={() => setTab(tab)}>{label}</button>
                ))}
              </div>

              <div className="rp-panel" id="rp-panel" role="tabpanel" aria-labelledby={`rp-tab-${config.tab}`}>
                <div className="rp-top">
                  <button type="button" className="rp-range" onClick={() => setFiltersOpen(true)} aria-label={`Date range: ${presetLabel(range.preset)}, ${rText}. Change`}>
                    <span className="rp-range-title">{presetLabel(range.preset)} <CalendarRange aria-hidden /></span>
                    <span className="rp-range-dates">{rText}{config.interval !== "month" ? ` · by ${PERIOD_NOUN[config.interval].toLowerCase()}` : ""}</span>
                  </button>
                  <div className="so-seg" role="group" aria-label="Chart type">
                    {charts.map(({ v, label, Icon }) => (
                      <button key={v} type="button" aria-pressed={config.chart === v} onClick={() => { update({ chart: v }); setSort(null); }} aria-label={label} title={label}>
                        <Icon aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>

                {(showViewBy || filterCount > 0) && (
                  <div className="rp-controls">
                    {showViewBy && (
                      <label className="so-viewby rp-viewby">
                        <span className="mh-muted mh-small">View by</span>
                        <span className="so-select">
                          <select value={config.viewBy} onChange={(e) => update({ viewBy: e.target.value as ViewBy })}>
                            <option value="category">Category</option>
                            <option value="merchant">Merchant</option>
                          </select>
                          <ChevronDown aria-hidden />
                        </span>
                      </label>
                    )}
                    {config.filters.groups.map((g) => (
                      <button key={g} type="button" className="rp-pill" onClick={() => update({ filters: { ...config.filters, groups: config.filters.groups.filter((x) => x !== g) } })}
                        aria-label={`Remove filter ${g}`}>{g} <span aria-hidden>×</span></button>
                    ))}
                    {config.filters.merchant.trim() && (
                      <button type="button" className="rp-pill" onClick={() => update({ filters: { ...config.filters, merchant: "" } })}
                        aria-label={`Remove merchant filter ${config.filters.merchant}`}>“{config.filters.merchant.trim()}” <span aria-hidden>×</span></button>
                    )}
                  </div>
                )}

                {data.loading ? (
                  <div className="mh-skel mt-4" style={{ height: 260 }} aria-label="Loading report" />
                ) : data.error ? (
                  <div className="rp-state" role="alert">
                    <p className="m-0">{data.error}</p>
                    <button type="button" className="mh-btn-outline mt-3" onClick={data.retry}>Try again</button>
                  </div>
                ) : !hasAny ? (
                  <div className="rp-state">
                    <p className="rp-state-title">No transactions in this date range</p>
                    <p className="m-0">Reports build from your connected accounts. Try a longer range, or connect an account to get started.</p>
                  </div>
                ) : !hasKind ? (
                  <div className="rp-state">
                    <p className="rp-state-title">{filterCount ? "Nothing matches these filters" : `No ${noun} in this date range`}</p>
                    {filterCount > 0 && <button type="button" className="mh-btn-outline mt-3" onClick={() => update({ filters: emptyFilters() })}>Clear filters</button>}
                  </div>
                ) : (
                  <>
                    {chart}
                    {data.truncated && (
                      <p className="rp-note">This range has more transactions than one report can hold, so the oldest part is missing. Try a shorter range.</p>
                    )}
                    <dl className="so-strip rp-strip" data-cols={strip.length}>
                      {strip.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mh-amount">{v}</dd></div>)}
                    </dl>
                    <div className="so-table-wrap">
                      <table className="so-table rp-table">
                        <caption className="sr-only">{cap(noun)} table, {rText}</caption>
                        <thead>
                          <tr>
                            {head.map((h, i) => (
                              <th key={h} scope="col" aria-sort={sortBy.col === i ? (sortBy.dir === "asc" ? "ascending" : "descending") : undefined}>
                                <button type="button" className="rp-sort" onClick={() => toggleSort(i)}>
                                  {h}
                                  {sortBy.col === i && (sortBy.dir === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />)}
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.key}>
                              <th scope="row">{r.first}</th>
                              {r.cells.map((c, i) => <td key={i} className="mh-amount">{c.node}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </HomeCard>
          </div>
          <aside className="mh-col" aria-label="Saved reports">
            <SavedReportsCard views={saved.views} loading={saved.loading} error={saved.error} activeId={activeId} dirty={dirty}
              onOpen={openView} onRetry={() => void saved.reload()}
              onSave={() => {
                const same = saved.views.find((v) => sameConfig(v.config, config));
                if (same) { setActiveId(same.id); toast(`Already saved as “${same.name}”`); return; }
                setNameError(null); setNameDialog({ mode: "save" });
              }}
              onRename={(v) => { setNameError(null); setNameDialog({ mode: "rename", view: v }); }}
              onUpdate={(v) => void updateActive(v)}
              onDelete={(v) => setToDelete(v)} />
          </aside>
        </div>
      </div>

      <FiltersDialog open={filtersOpen} initial={draft} today={today} onClose={() => setFiltersOpen(false)}
        onApply={(d) => { update({ range: d.range, interval: d.interval, filters: d.filters }); setFiltersOpen(false); }} />
      <NameDialog open={!!nameDialog}
        title={nameDialog?.mode === "rename" ? "Rename report" : "Save report"}
        intro={nameDialog?.mode === "rename" ? "Give this saved report a new name." : "Save these filters for quick access to the reports you use most."}
        initialName={nameDialog?.mode === "rename" ? nameDialog.view?.name ?? "" : suggestViewName(config)}
        confirmLabel="Save" busy={nameBusy} error={nameError}
        onSubmit={(n) => void submitName(n)} onClose={() => setNameDialog(null)} />
      <ConfirmDeleteDialog view={toDelete} busy={delBusy} onConfirm={() => void confirmDelete()} onClose={() => setToDelete(null)} />
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Period-on-period change chip. Lower expenses / higher income read as good. */
function Change({ pct, tab }: { pct: number | null; tab: ReportTab }) {
  if (pct === null) return <span className="mh-faint">—</span>;
  const up = pct > 0;
  const tone = pct === 0 || tab === "transfers" ? "flat" : (tab === "expenses" ? !up : up) ? "good" : "bad";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="rp-chip-change" data-tone={tone}>
      {up ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct).toFixed(1)}%{pct !== 0 && <Icon aria-hidden />}
      <span className="sr-only">{up ? " up" : pct < 0 ? " down" : ""} on the previous period</span>
    </span>
  );
}
