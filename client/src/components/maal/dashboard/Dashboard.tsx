import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { GripVertical, Eye, EyeOff, Maximize2, Minimize2, Plus, Settings2, ArrowUpRight, Info, ChevronDown, Layers, CreditCard, FileText, RefreshCw, Cloud, CloudOff, AlertTriangle, X, Pencil, Check } from "lucide-react";
import { AskMaalTile } from "@/components/maal/dashboard/AskMaalTile";
import { fetchPortfolio, type Portfolio } from "@/lib/portfolio";
import { fetchMaalScore, type MaalScore } from "@/lib/maalScore";
import { fetchProfile, saveProfile } from "@/lib/profile";
import { fetchSnapshots, snapshotValue, snapshotLabel, type Snapshot } from "@/lib/snapshots";
import { listTransactions } from "@/lib/transactions.functions";
import { listGoals } from "@/lib/goals.functions";
import { listVault } from "@/lib/vault.functions";
import { formatAUD } from "@/lib/score";
import { supabase } from "@/integrations/api";

import { getMarketIndices, getMarketNews, getUpcomingEarnings } from "@/lib/markets.functions";
import { ChartModal } from "@/components/maal/ChartModal";

const PERIODS = ["1M", "3M", "YTD", "1Y", "All"] as const;
type Period = (typeof PERIODS)[number];

type Size = "sm" | "md" | "lg" | "wide";
type TileDef = { id: string; title: string; defaultSize: Size; kind: string };

const TILES: TileDef[] = [
  { id: "maal_score",   title: "Maal Score",           defaultSize: "md", kind: "maal_score" },
  { id: "net_worth",    title: "Net Worth",            defaultSize: "sm", kind: "kpi_net_worth" },
  { id: "investments",  title: "Investments Value",    defaultSize: "sm", kind: "kpi_investments" },
  { id: "cash",         title: "Total Cash",           defaultSize: "sm", kind: "kpi_cash" },
  { id: "debts",        title: "Total Debts",          defaultSize: "sm", kind: "kpi_debts" },
  { id: "ask_composer", title: "Ask Maal",             defaultSize: "wide", kind: "ask_composer" },
  { id: "radar",        title: "Radar",                defaultSize: "lg", kind: "radar" },
  { id: "assets",       title: "Assets",               defaultSize: "md", kind: "assets" },
  { id: "liabilities",  title: "Liabilities",          defaultSize: "md", kind: "liabilities" },
  { id: "setup",        title: "Setup Progress",       defaultSize: "md", kind: "setup" },
  { id: "tax",          title: "Tax Impact",           defaultSize: "md", kind: "tax" },
  { id: "movers",       title: "Top & Bottom Movers",  defaultSize: "md", kind: "movers" },
  { id: "market",       title: "Market Summary",       defaultSize: "md", kind: "market" },
  { id: "news",         title: "Latest News",          defaultSize: "md", kind: "news" },
  { id: "transactions", title: "Recent Transactions",  defaultSize: "md", kind: "transactions" },
  { id: "earnings",     title: "Upcoming Earnings",    defaultSize: "md", kind: "earnings" },
  { id: "runway",       title: "Cash Runway",          defaultSize: "md", kind: "runway" },
  { id: "outgoing",     title: "Outgoing",             defaultSize: "md", kind: "outgoing" },
];

type Layout = { order: string[]; sizes: Record<string, Size>; hidden: string[] };
// v3: removed the old small "ask" tile; the Ask Maal composer is now a full-width
// band placed right below the KPI tiles. Bumped so saved v2 layouts don't pin the
// old order/tile.
const STORAGE_KEY = "maal.dashboard.v3";
const DEFAULT_VISIBLE = new Set([
  "maal_score", "net_worth", "investments", "cash", "debts",
  "ask_composer", "transactions", "runway",
]);

function defaultLayout(): Layout {
  return {
    order: TILES.map((t) => t.id),
    sizes: Object.fromEntries(TILES.map((t) => [t.id, t.defaultSize])) as Record<string, Size>,
    hidden: TILES.filter((t) => !DEFAULT_VISIBLE.has(t.id)).map((t) => t.id),
  };
}
function normalizeLayout(parsed?: Partial<Layout> | null): Layout {
  const base = defaultLayout();
  if (!parsed?.order || !Array.isArray(parsed.order)) return base;
  const knownIds = new Set(TILES.map((t) => t.id));
  const parsedSizes = parsed.sizes && typeof parsed.sizes === "object" ? parsed.sizes : {};
  const allowedSizes = new Set<Size>(["sm", "md", "lg", "wide"]);
  const uniqueOrder = [...new Set(parsed.order.filter((id) => knownIds.has(id)))];
  const safeSizes = Object.fromEntries(
    Object.entries(parsedSizes).filter(([id, size]) => knownIds.has(id) && allowedSizes.has(size as Size)),
  ) as Record<string, Size>;
  return {
    order: [
      ...uniqueOrder,
      ...base.order.filter((id) => !uniqueOrder.includes(id)),
    ],
    sizes: { ...base.sizes, ...safeSizes },
    hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => knownIds.has(id)) : base.hidden,
  };
}
function loadLocalLayout(): { layout: Layout; updatedAt: number } {
  if (typeof window === "undefined") return { layout: defaultLayout(), updatedAt: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { layout: defaultLayout(), updatedAt: 0 };
    const parsed = JSON.parse(raw) as Layout | { layout: Layout; updatedAt: string };
    if (parsed && typeof parsed === "object" && "layout" in parsed) {
      return { layout: normalizeLayout(parsed.layout), updatedAt: new Date(parsed.updatedAt).getTime() || 0 };
    }
    return { layout: normalizeLayout(parsed), updatedAt: 0 };
  } catch { return { layout: defaultLayout(), updatedAt: 0 }; }
}
function saveLayout(l: Layout, updatedAt: number) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout: l, updatedAt: new Date(updatedAt).toISOString() })); } catch {}
}

const sizeClass: Record<Size, string> = {
  sm:   "col-span-12 sm:col-span-6 lg:col-span-3",
  md:   "col-span-12 sm:col-span-6 lg:col-span-4",
  lg:   "col-span-12 lg:col-span-6",
  wide: "col-span-12",
};
const nextSize: Record<Size, Size> = { sm: "md", md: "lg", lg: "wide", wide: "sm" };

export function Dashboard() {
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<Period>("YTD");
  const [layout, setLayout] = useState<Layout>(defaultLayout);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [score, setScore] = useState<MaalScore | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastRefreshAttempt, setLastRefreshAttempt] = useState<Date | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [remoteLayoutReady, setRemoteLayoutReady] = useState(false);
  const [layoutSync, setLayoutSync] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editMode, setEditMode] = useState(false);
  const dragId = useRef<string | null>(null);
  const layoutReadyRef = useRef(false);
  const remoteLayoutReadyRef = useRef(false);
  const layoutChangedRef = useRef(false);
  const localLayoutUpdatedAtRef = useRef(0);

  function markLayoutChanged() {
    layoutChangedRef.current = true;
    localLayoutUpdatedAtRef.current = Date.now();
  }

  const loadDashboard = useCallback(async () => {
      setLoadState("loading");
      setLoadErrors([]);
      const [userRes, profRes, portRes, scoreRes, snapshotRes] = await Promise.allSettled([
        supabase.auth.getUser(),
        fetchProfile(),
        fetchPortfolio(),
        fetchMaalScore(),
        fetchSnapshots(2605),
      ]);
      const u = userRes.status === "fulfilled" ? userRes.value.data : null;
      const prof = profRes.status === "fulfilled" ? profRes.value : null;
      setName(prof?.display_name || u?.user?.email?.split("@")[0] || "");
      setCreatedAt(prof?.created_at ?? null);
      // BIGINT columns arrive as strings — coerce before arithmetic.
      setMonthlyExpenses(prof?.monthly_expenses ? Number(prof.monthly_expenses) : null);
      if (portRes.status === "fulfilled") setPortfolio(portRes.value);
      if (scoreRes.status === "fulfilled") setScore(scoreRes.value);
      if (snapshotRes.status === "fulfilled") setSnapshots(snapshotRes.value);
      if (!layoutReadyRef.current) {
        const local = loadLocalLayout();
        const remoteUpdatedAt = new Date(prof?.dashboard_layout_updated_at || 0).getTime() || 0;
        const useLocal = local.updatedAt > remoteUpdatedAt;
        setLayout(!useLocal && prof?.dashboard_layout ? normalizeLayout(prof.dashboard_layout) : local.layout);
        localLayoutUpdatedAtRef.current = useLocal ? local.updatedAt : remoteUpdatedAt;
        layoutChangedRef.current = useLocal;
        layoutReadyRef.current = true;
        setLayoutReady(true);
      }
      if (prof && !remoteLayoutReadyRef.current) {
        const remoteUpdatedAt = new Date(prof.dashboard_layout_updated_at || 0).getTime() || 0;
        if (prof.dashboard_layout && remoteUpdatedAt > localLayoutUpdatedAtRef.current) {
          setLayout(normalizeLayout(prof.dashboard_layout));
          localLayoutUpdatedAtRef.current = remoteUpdatedAt;
          layoutChangedRef.current = false;
        }
        remoteLayoutReadyRef.current = true;
        setRemoteLayoutReady(true);
      }

      const errors: string[] = [];
      if (userRes.status === "rejected") errors.push("account");
      if (profRes.status === "rejected" || !prof) errors.push("profile");
      if (portRes.status === "rejected") errors.push("balances");
      else if (portRes.value.errors?.length) errors.push(...portRes.value.errors.map((e) => e.split(":")[0]));
      if (scoreRes.status === "rejected") errors.push("Maal Score");
      if (snapshotRes.status === "rejected") errors.push("history");
      const uniqueErrors = [...new Set(errors)];
      setLoadErrors(uniqueErrors);
      const hasUsefulData = portRes.status === "fulfilled" || scoreRes.status === "fulfilled";
      setLoadState(uniqueErrors.length ? (hasUsefulData ? "partial" : "error") : "ready");
      setLastRefreshAttempt(new Date());
      if (uniqueErrors.length === 0 && portRes.status === "fulfilled" && portRes.value.updatedAt) {
        setLastUpdated(new Date(portRes.value.updatedAt));
      }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!layoutReady) return;
    saveLayout(layout, localLayoutUpdatedAtRef.current);
    if (!remoteLayoutReady) {
      setLayoutSync("error");
      return;
    }
    setLayoutSync("saving");
    const timer = window.setTimeout(async () => {
      const persistenceTimestamp = localLayoutUpdatedAtRef.current || Date.now();
      const saved = await saveProfile({
        dashboard_layout: layout,
        dashboard_layout_updated_at: new Date(persistenceTimestamp).toISOString(),
      });
      if (saved) localLayoutUpdatedAtRef.current = persistenceTimestamp;
      setLayoutSync(saved ? "saved" : "error");
    }, 600);
    return () => window.clearTimeout(timer);
  }, [layout, layoutReady, remoteLayoutReady]);

  function toggleHidden(id: string) {
    markLayoutChanged();
    setLayout((l) => l.hidden.includes(id)
      ? { ...l, hidden: l.hidden.filter((x) => x !== id) }
      : { ...l, hidden: [...l.hidden, id] });
  }
  function cycleSize(id: string) {
    markLayoutChanged();
    setLayout((l) => ({ ...l, sizes: { ...l.sizes, [id]: nextSize[l.sizes[id] ?? "md"] } }));
  }
  function onDragStart(id: string) { dragId.current = id; }
  // Keyboard-accessible reordering: focus a tile's grip (or the Ask Maal band)
  // and use Left/Right arrows to move it. Pointer drag is unchanged.
  function moveTile(id: string, dir: -1 | 1) {
    markLayoutChanged();
    setLayout((l) => {
      const order = [...l.order];
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return l;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...l, order };
    });
  }
  function onTileKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); moveTile(id, -1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveTile(id, 1); }
  }
  function onDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    const from = dragId.current;
    if (!from || from === overId) return;
    markLayoutChanged();
    setLayout((l) => {
      const order = [...l.order];
      const fi = order.indexOf(from);
      const oi = order.indexOf(overId);
      if (fi < 0 || oi < 0) return l;
      order.splice(fi, 1);
      order.splice(oi, 0, from);
      return { ...l, order };
    });
  }

  const visibleTiles = useMemo(
    () => layout.order.map((id) => TILES.find((t) => t.id === id)!).filter((t) => t && !layout.hidden.includes(t.id)),
    [layout]
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 py-6 md:py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] md:text-[32px] tracking-display font-bold">Welcome{name ? `, ${name}` : ""}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>Manual and connected financial data</span>
            <span aria-hidden="true">·</span>
            <span>{lastUpdated ? `Oldest source update ${lastUpdated.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : lastRefreshAttempt && loadState === "ready" ? "No source timestamp yet" : lastRefreshAttempt ? "No complete refresh yet" : "Updating…"}</span>
            {loadState === "partial" || loadState === "error" ? <span className="font-semibold text-[var(--gold)]">Stale data may be shown</span> : null}
            {layoutSync === "saving" && <span className="inline-flex items-center gap-1"><Cloud className="size-3" /> Saving layout</span>}
            {layoutSync === "saved" && <span className="inline-flex items-center gap-1 text-mint"><Check className="size-3" /> Layout saved</span>}
            {layoutSync === "error" && <span className="inline-flex items-center gap-1 text-[var(--gold)]"><CloudOff className="size-3" /> Saved on this device</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu.Root open={periodOpen} onOpenChange={(open) => { setPeriodOpen(open); if (open) setAddOpen(false); }}>
            <DropdownMenu.Trigger asChild>
              <button
                aria-label={`Dashboard period: ${period}`}
                className="flex items-center gap-2 pl-3 pr-2 py-2 border border-border rounded-full text-[12px] font-medium bg-[var(--surface)] hover:border-mint/40"
              >
                {period} <ChevronDown className="size-3.5 opacity-60" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-32 rounded-[10px] border border-border bg-[var(--surface)] shadow-lg overflow-hidden p-1">
                <DropdownMenu.RadioGroup value={period} onValueChange={(value) => setPeriod(value as Period)}>
                  {PERIODS.map((p) => (
                  <DropdownMenu.RadioItem key={p} value={p} onSelect={() => setPeriod(p)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-[12px] outline-none hover:bg-secondary focus:bg-secondary">
                    {p}{period === p && <Check className="size-3.5 text-mint" />}
                  </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Link to="/app/report"
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-full text-[12px] font-medium bg-[var(--surface)] hover:border-mint/40">
            <FileText className="size-3.5" /> Report
          </Link>
          <button onClick={() => { setEditMode(true); setCustomiseOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-full text-[12px] font-medium bg-[var(--surface)] hover:border-mint/40">
            <Settings2 className="size-3.5" /> Widgets
          </button>
          <DropdownMenu.Root open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (open) setPeriodOpen(false); }}>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-1.5 pl-3 pr-2.5 py-2 rounded-full text-[12px] font-semibold bg-mint text-background hover:opacity-90">
                Add <Plus className="size-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-64 rounded-[12px] border border-border bg-[var(--surface)] shadow-lg overflow-hidden">
                  <DropdownMenu.Item asChild>
                    <a href="/app/assets?add=asset" className="flex items-start gap-3 px-3 py-3 outline-none hover:bg-secondary focus:bg-secondary">
                    <span className="mt-0.5 size-8 rounded-md bg-secondary grid place-items-center"><Layers className="size-4" /></span>
                    <span>
                      <span className="block text-[13px] font-semibold">Add asset</span>
                      <span className="block text-[11px] text-muted-foreground">Account, property, vehicle, or other</span>
                    </span>
                    </a>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild>
                    <a href="/app/assets?add=liability" className="flex items-start gap-3 px-3 py-3 outline-none hover:bg-secondary focus:bg-secondary border-t border-border">
                    <span className="mt-0.5 size-8 rounded-md bg-secondary grid place-items-center"><CreditCard className="size-4" /></span>
                    <span>
                      <span className="block text-[13px] font-semibold">Add liability</span>
                      <span className="block text-[11px] text-muted-foreground">Loan, credit card, mortgage</span>
                    </span>
                    </a>
                  </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {loadState !== "ready" && (
        <div role={loadState === "loading" ? "status" : "alert"}
          className={`mb-4 flex items-start gap-3 rounded-[12px] border p-3 text-[12px] ${loadState === "error" ? "border-destructive/40 bg-destructive/5" : "border-border bg-[var(--surface)]"}`}>
          {loadState === "loading" ? <RefreshCw className="size-4 shrink-0 animate-spin text-mint" /> : <AlertTriangle className="size-4 shrink-0 text-[var(--gold)]" />}
          <div className="flex-1">
            <p className="font-semibold">{loadState === "loading" ? "Refreshing your financial picture…" : loadState === "partial" ? "Some dashboard data could not be refreshed" : "Dashboard data is unavailable"}</p>
            {loadErrors.length > 0 && <p className="mt-0.5 text-muted-foreground">Affected: {loadErrors.join(", ")}. Existing values are kept where available.</p>}
          </div>
          {loadState !== "loading" && (
            <button onClick={() => void loadDashboard()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-semibold hover:bg-secondary">
              <RefreshCw className="size-3" /> Retry
            </button>
          )}
        </div>
      )}

      {editMode && (
        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-mint/30 bg-mint/5 px-3 py-2 text-[12px]">
          <span className="inline-flex items-center gap-2"><Pencil className="size-3.5 text-mint" /> Edit mode: drag handles reorder tiles; resize or hide controls are now available.</span>
          <button onClick={() => setEditMode(false)} className="font-semibold text-mint hover:underline">Done</button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 auto-rows-min">
        {visibleTiles.map((t) => {
          const size = layout.sizes[t.id] ?? t.defaultSize;
          // The Ask Maal composer brings its own card, so it renders full-width
          // without the tile chrome (no title header / double border).
          if (t.kind === "ask_composer") {
            return (
              <div key={t.id}
                onDragOver={(e) => onDragOver(e, t.id)}
                onDragEnd={() => (dragId.current = null)}
                className={`${sizeClass.wide} relative`}
              >
                {editMode && (
                  <button type="button" draggable onDragStart={() => onDragStart(t.id)}
                    onKeyDown={(e) => onTileKeyDown(e, t.id)}
                    aria-label={`Reorder ${t.title} tile. Drag, or use left and right arrow keys.`}
                    className="absolute right-3 top-3 z-20 cursor-grab rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground shadow-sm">
                    <GripVertical className="size-4" />
                  </button>
                )}
                <AskMaalTile />
              </div>
            );
          }
          return (
            <div key={t.id}
              onDragOver={(e) => onDragOver(e, t.id)}
              onDragEnd={() => (dragId.current = null)}
              className={`${sizeClass[size]} group relative rounded-[14px] border border-border bg-[var(--surface)] p-5 transition hover:border-foreground/30`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  {editMode && <button
                    type="button"
                    draggable
                    onDragStart={() => onDragStart(t.id)}
                    onKeyDown={(e) => onTileKeyDown(e, t.id)}
                    title={`Reorder ${t.title} tile (left/right arrow keys)`}
                    aria-label={`Reorder ${t.title} tile. Use left and right arrow keys.`}
                    className="p-0.5 rounded text-muted-foreground/50 cursor-grab hover:text-muted-foreground focus-visible:text-muted-foreground focus:outline-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition"
                  >
                    <GripVertical className="size-3.5" />
                  </button>}
                  <p className="text-[13px] font-semibold truncate">{t.title}</p>
                </div>
                {editMode && <div className="flex items-center gap-1">
                  <button onClick={() => cycleSize(t.id)} title={`Resize ${t.title} tile`} aria-label={`Resize ${t.title} tile (currently ${size})`}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary">
                    {size === "wide" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                  </button>
                  <button onClick={() => toggleHidden(t.id)} title={`Hide ${t.title} tile`} aria-label={`Hide ${t.title} tile`}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary">
                    <EyeOff className="size-3.5" />
                  </button>
                </div>}
              </div>
              <TileBody
                kind={t.kind}
                period={period}
                portfolio={portfolio}
                score={score}
                snapshots={snapshots}
                createdAt={createdAt}
                monthlyExpenses={monthlyExpenses}
                scoreError={loadErrors.includes("Maal Score")}
                historyError={loadErrors.includes("history")}
              />
            </div>
          );
        })}
      </div>

      <DialogPrimitive.Root open={customiseOpen} onOpenChange={setCustomiseOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <DialogPrimitive.Content
            aria-describedby="customise-dashboard-description"
            className="fixed right-0 top-0 z-50 w-full max-w-sm h-full bg-background border-l border-border p-6 overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <DialogPrimitive.Title className="text-[16px] font-semibold">Dashboard widgets</DialogPrimitive.Title>
              <DialogPrimitive.Close aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description id="customise-dashboard-description" className="text-[12px] text-muted-foreground mb-4">
              Keep the dashboard focused. Add only the widgets you use, then enter edit mode to reorder or resize them.
            </DialogPrimitive.Description>
            <ul className="space-y-1">
              {TILES.map((t) => {
                const hidden = layout.hidden.includes(t.id);
                return (
                  <li key={t.id} className="flex items-center justify-between py-2 border-b border-border/60">
                    <span className="text-[13px]">{t.title}</span>
                    <button onClick={() => toggleHidden(t.id)}
                      className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
                      {hidden ? <><EyeOff className="size-3.5" /> Hidden</> : <><Eye className="size-3.5" /> Visible</>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button onClick={() => { markLayoutChanged(); setLayout(defaultLayout()); }}
              className="mt-5 w-full py-2 border border-border rounded-[8px] text-[12px] text-muted-foreground hover:text-foreground">
              Reset to default
            </button>
            <button onClick={() => { setEditMode(true); setCustomiseOpen(false); }}
              className="mt-2 w-full py-2 rounded-[8px] text-[12px] font-semibold bg-foreground text-background">
              Edit dashboard layout
            </button>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

// ===== Tile bodies ===================================================

// Start-of-range timestamp for the dashboard period selector. "All" floors at the
// account-creation date (item 3) so history begins when the user joined.
function rangeStartTs(period: Period, createdAt: string | null): number {
  const now = Date.now();
  const day = 864e5;
  switch (period) {
    case "1M": return now - 30 * day;
    case "3M": return now - 90 * day;
    case "YTD": return new Date(new Date().getFullYear(), 0, 1).getTime();
    case "1Y": return now - 365 * day;
    case "All": default: return createdAt ? new Date(createdAt).getTime() : 0;
  }
}

function TileBody({ kind, period, portfolio, score, snapshots, createdAt, monthlyExpenses, scoreError, historyError }: { kind: string; period: Period; portfolio: Portfolio | null; score: MaalScore | null; snapshots: Snapshot[]; createdAt: string | null; monthlyExpenses: number | null; scoreError: boolean; historyError: boolean }) {
  if (kind.startsWith("kpi_")) return <KpiTile kind={kind} portfolio={portfolio} snapshots={snapshots} period={period} createdAt={createdAt} historyError={historyError} />;
  switch (kind) {
    case "maal_score": return scoreError ? <UnavailableState label="your Maal Score" /> : <MaalScoreTile score={score} />;
    case "radar": return <RadarTile />;
    case "assets": return <AssetsTile portfolio={portfolio} />;
    case "liabilities": return <LiabilitiesTile portfolio={portfolio} />;
    case "setup": return <SetupTile portfolio={portfolio} />;
    case "tax": return <TaxTile portfolio={portfolio} />;
    case "movers": return <Placeholder title="No investments yet" hint="Add investments to see your top movers." cta="Add investment" to="/app/assets" />;
    case "market": return <MarketTile />;
    case "news": return <NewsTile />;
    case "transactions": return <TransactionsTile />;
    case "earnings": return <EarningsTile />;
    case "runway": return <RunwayTile portfolio={portfolio} monthlyExpenses={monthlyExpenses} />;
    case "outgoing": return <Placeholder title="No spending data" hint="Connect transactions to see outgoing flow." cta="View transactions" to="/app/transactions" />;
    default: return null;
  }
  // period reserved for future use
  void period;
}

function useAsyncList(loader: () => Promise<unknown>) {
  const [items, setItems] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const result: any = await loader();
      setItems(Array.isArray(result) ? result : result?.items ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [loader]);
  useEffect(() => { void load(); }, [load]);
  return { items, state, retry: load };
}

function EarningsTile() {
  const { items, state, retry } = useAsyncList(getUpcomingEarnings);
  if (state === "loading") return <SkeletonRows />;
  if (state === "error") return <UnavailableState label="earnings dates" onRetry={retry} />;
  if (items.length === 0) {
    return <Placeholder title="No upcoming earnings" hint="Add investments with a ticker symbol to see upcoming earnings for your holdings." cta="Add investment" to="/app/assets" />;
  }
  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((e, i) => (
        <li key={`${e.symbol}-${e.date}-${i}`} className="flex items-center justify-between gap-3 text-[12px]">
          <span className="font-semibold">{e.symbol}</span>
          <span className="text-muted-foreground tabular-nums">
            {new Date(e.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            {e.epsEstimate != null && <span className="ml-2">est. EPS {Number(e.epsEstimate).toFixed(2)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TransactionsTile() {
  const { items, state, retry } = useAsyncList(listTransactions);
  if (state === "loading") return <SkeletonRows />;
  if (state === "error") return <UnavailableState label="transactions" onRetry={retry} />;
  if (items.length === 0) {
    return <Placeholder title="No transactions" hint="See your transactions after you connect an account." cta="Connect account" to="/app/transactions" />;
  }
  const recent = [...items]
    .sort((a, b) => new Date(b.post_date || 0).getTime() - new Date(a.post_date || 0).getTime())
    .slice(0, 6);
  return (
    <ul className="space-y-2">
      {recent.map((t) => {
        const amt = Number(t.amount) || 0;
        return (
          <li key={t.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] truncate text-foreground">{t.description || "Transaction"}</p>
              {t.post_date && <p className="text-[10px] text-muted-foreground">{new Date(t.post_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>}
            </div>
            <span className={`text-[12px] tabular-nums shrink-0 ${amt < 0 ? "text-foreground" : "text-mint"}`}>
              {amt < 0 ? "-" : "+"}{formatAUD(Math.abs(amt))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MaalScoreTile({ score }: { score: MaalScore | null }) {
  if (!score) {
    return <SkeletonKpi />;
  }
  if (!score.hasData) {
    return (
      <Placeholder
        title="No score yet"
        hint="Add your income, super, and assets to see your Maal Score."
        cta="Add details"
        to="/app/assets"
      />
    );
  }
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[40px] font-bold tracking-display tabular-nums leading-none">{score.score}</span>
        <span className="text-[13px] text-muted-foreground">/ 100</span>
        <span className="ml-auto inline-flex items-center text-[11px] font-semibold text-mint bg-mint/10 border border-mint/25 rounded-full px-2 py-0.5">
          {score.band}
        </span>
      </div>
      <div className="mt-3 h-[6px] rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-foreground rounded-full" style={{ width: `${Math.max(0, Math.min(100, score.score))}%` }} />
      </div>
      <SourceBadge source="calculated" label="Calculated from your financial profile and balances" />
      <ScoreHistorySparkline history={score.history} />
      <div className="mt-4 space-y-2.5">
        {score.pillars.map((p) => (
          <div key={p.key} title={p.note}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-foreground">{p.label}</span>
              <span className="tabular-nums text-muted-foreground">{p.score}</span>
            </div>
            <div className="mt-1 h-[4px] rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-foreground/70 rounded-full" style={{ width: `${Math.max(0, Math.min(100, p.score))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Daily Maal Score history, recorded server-side once per day. Needs at least
// two points to draw a line, so it stays hidden on day one and appears as the
// history accrues.
function ScoreHistorySparkline({ history }: { history?: Array<{ value: number; at: string }> }) {
  const pts = (history ?? []).filter((p) => Number.isFinite(p.value));
  if (pts.length < 2) return null;

  const W = 240;
  const H = 32;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1; // avoid divide-by-zero on a flat series
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - ((p.value - lo) / span) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = pts[0].value;
  const last = pts[pts.length - 1].value;
  const delta = last - first;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1">
        <span>Score history</span>
        {delta !== 0 && (
          <span className={delta > 0 ? "text-mint" : "text-[hsl(0_70%_55%)]"}>
            {delta > 0 ? "+" : ""}{delta} since {pts.length} {pts.length === 1 ? "day" : "days"} tracked
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-foreground" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const KPI_META: Record<string, { title: string; positive: boolean }> = {
  kpi_net_worth:   { title: "Net Worth",         positive: true },
  kpi_investments: { title: "Investments Value", positive: true },
  kpi_cash:        { title: "Total Cash",        positive: true },
  kpi_debts:       { title: "Total Debts",       positive: false },
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashKey(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function buildKpiSeries(months: number, current: number): number[] {
  // Flat line at current value — shows today's balance tracked forward.
  // Real historical trend will display once snapshot data accumulates.
  return new Array(months).fill(current ?? 0);
}
function monthLabel(monthsAgo: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

function KpiSparkline({
  data,
  labels,
  positive,
  markerIndices,
  width = 220,
  height = 56,
}: {
  data: number[];
  labels: string[];
  positive: boolean;
  markerIndices?: number[];
  width?: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const padY = 4;
  const innerH = height - padY * 2;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const pts = data.map((v, i) => ({
    x: i * step,
    y: padY + innerH - ((v - min) / span) * innerH,
    v,
    label: labels[i],
  }));
  const line = `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${height} L 0,${height} Z`;
  const stroke = positive ? "var(--mint)" : "var(--foreground)";

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (e.clientX - rect.left) * ratio;
    const idx = Math.max(0, Math.min(pts.length - 1, Math.round(x / step)));
    setHover(idx);
  }
  const sel = hover != null ? pts[hover] : null;
  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`spk-${positive ? "p" : "n"}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spk-${positive ? "p" : "n"})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Entry-marker dots */}
        {markerIndices?.map((idx) => {
          const p = pts[idx];
          if (!p) return null;
          return (
            <g key={idx} pointerEvents="none">
              <circle cx={p.x} cy={p.y} r={3.5} fill="var(--background)" stroke={stroke} strokeWidth={1.5} />
              <circle cx={p.x} cy={p.y} r={1.25} fill={stroke} />
            </g>
          );
        })}
        {sel && (
          <g pointerEvents="none">
            <line x1={sel.x} x2={sel.x} y1={0} y2={height} stroke="var(--foreground)" strokeOpacity={0.25} strokeDasharray="2 3" />
            <circle cx={sel.x} cy={sel.y} r={3.5} fill="var(--background)" stroke={stroke} strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {sel && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-[10px] shadow-sm"
          style={{ left: `${(sel.x / width) * 100}%` }}
        >
          <div className="text-muted-foreground uppercase tracking-[0.08em]">{sel.label}</div>
          <div className="font-semibold tabular-nums">{formatAUD(sel.v)}</div>
        </div>
      )}
    </div>
  );
}

function KpiTile({ kind, portfolio, snapshots, period, createdAt, historyError }: { kind: string; portfolio: Portfolio | null; snapshots: Snapshot[]; period: Period; createdAt: string | null; historyError: boolean }) {
  const [open, setOpen] = useState(false);
  const partial = !!portfolio?.errors?.length;
  const value = useMemo(() => {
    if (!portfolio || partial) return null;
    switch (kind) {
      case "kpi_net_worth": return portfolio.superBalance + portfolio.investments + portfolio.property + portfolio.cash - portfolio.propertyDebt - portfolio.otherDebt;
      case "kpi_investments": return portfolio.investments + portfolio.superBalance;
      case "kpi_cash": return portfolio.cash;
      case "kpi_debts": return portfolio.propertyDebt + portfolio.otherDebt;
      default: return 0;
    }
  }, [kind, portfolio, partial]);
  const meta = KPI_META[kind] ?? { title: "Value", positive: true };
  const source = kind === "kpi_net_worth" ? "calculated"
    : kind === "kpi_investments" ? portfolio?.provenance?.investments
    : kind === "kpi_cash" ? portfolio?.provenance?.cash
    : portfolio?.provenance?.debts;
  const series = useMemo(() => {
    // Real daily history for this kind, filtered to the selected range (item 7).
    const start = rangeStartTs(period, createdAt);
    const all = (snapshots ?? [])
      .map((s) => ({ v: snapshotValue(s, kind), label: snapshotLabel(s.date), t: new Date(s.date).getTime() }))
      .filter((p) => Number.isFinite(p.v));
    const inRange = all.filter((p) => p.t >= start);
    // Use the in-range window when it has enough points; else fall back to all real
    // history so a sparse range doesn't render a broken single-point line.
    const real = inRange.length >= 2 ? inRange : all;
    if (real.length >= 2) {
      return { data: real.map((p) => p.v), labels: real.map((p) => p.label), real: true };
    }
    // Fallback: flat line at today's value until history accrues.
    if (value === null || historyError) return null;
    const months = 12;
    const data = buildKpiSeries(months, value ?? 0);
    const labels = data.map((_, i) => monthLabel(months - 1 - i));
    return { data, labels, real: false };
  }, [kind, value, snapshots, period, createdAt, historyError]);

  // Unabridged history for the trend modal — it applies its own range filter, so
  // the dashboard period selector must not constrain what the dialog can show.
  const fullSeries = useMemo(() => {
    const all = (snapshots ?? [])
      .map((s) => ({ v: snapshotValue(s, kind), label: snapshotLabel(s.date), t: new Date(s.date).getTime() }))
      .filter((p) => Number.isFinite(p.v));
    return all.length >= 2
      ? { data: all.map((p) => p.v), labels: all.map((p) => p.label) }
      : null;
  }, [kind, snapshots]);

  if (!portfolio) return <SkeletonKpi />;

  const first = series?.data[0] ?? 0;
  const last = series?.data[series.data.length - 1] ?? 0;
  const delta = last - first;
  const pct = first ? (delta / Math.abs(first)) * 100 : 0;
  const goodDirection = meta.positive ? delta >= 0 : delta <= 0;

  return (
    <div>
      <div className="-mx-1 mb-2 relative">
        {series ? (
          <div className="relative">
            <KpiSparkline
              data={series.data}
              labels={series.labels}
              positive={meta.positive}
              markerIndices={[series.data.length - 1]}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(true); }}
              aria-label={`Expand ${meta.title} chart`}
              className="absolute top-0 right-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary opacity-40 hover:opacity-100 transition"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="h-14" />
        )}
      </div>
      <p className="text-[26px] font-bold tabular-nums">{value === null ? "—" : formatAUD(value)}</p>
      {value !== null && <SourceBadge source={source ?? "manual"} />}
      {partial && <p className="mt-1 text-[11px] text-[var(--gold)]">Unavailable until all balance sources refresh.</p>}
      {!partial && historyError && <p className="mt-1 text-[11px] text-[var(--gold)]">Current balance loaded; trend history is unavailable.</p>}
      <p className={`text-[11px] mt-1 tabular-nums ${goodDirection ? "text-[var(--mint)]" : "text-muted-foreground"}`}>
        {series?.real ? (
          <span className={goodDirection ? "text-[var(--mint)]" : "text-muted-foreground"}>
            {delta >= 0 ? "▲" : "▼"} {formatAUD(Math.abs(delta))} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
          </span>
        ) : value === null || value === 0 ? "—" : (
          <span className="text-muted-foreground">Tracking from today</span>
        )}
      </p>
      {kind === "kpi_net_worth" && snapshots.at(-1)?.change?.material && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{snapshots.at(-1)?.change?.summary}</p>
      )}
      {kind === "kpi_investments" && snapshots.at(-1)?.investmentPerformance?.return_pct != null && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {snapshots.at(-1)?.investmentPerformance?.return_pct}% investment return, excluding {formatAUD(snapshots.at(-1)?.investmentPerformance?.net_contributions ?? 0)} net deposits.
        </p>
      )}
      {kind === "kpi_cash" && snapshots.at(-1)?.cashForecast?.accounts?.length ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Forecast in 30 days: {formatAUD(snapshots.at(-1)!.cashForecast!.accounts.reduce((sum, account) => sum + Number(account.closing_balance), 0))}.
        </p>
      ) : null}
      {kind === "kpi_cash" && snapshots.at(-1)?.cashRisks?.shortfalls?.length ? (
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--gold)]">
          Possible shortfall by {snapshots.at(-1)!.cashRisks!.shortfalls[0].date}: add {formatAUD(snapshots.at(-1)!.cashRisks!.shortfalls[0].amount_needed)} buffer.
        </p>
      ) : null}
      {value !== null && (
        <ChartModal
          open={open}
          onOpenChange={setOpen}
          title={meta.title}
          seriesKey={kind}
          current={value}
          positive={meta.positive}
          valueFormatted={formatAUD(value)}
          series={fullSeries?.data}
          labels={fullSeries?.labels}
        />
      )}
    </div>
  );
}

function RadarTile() {
  return (
    <div className="text-center py-6">
      <p className="text-[13px] mb-5">Tell Maal what to watch and get pinged when it matters.</p>
      <div className="flex items-center justify-center gap-6 text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-5">
        <span>Checks on schedule</span>
        <span>›</span>
        <span>Pings when it matters</span>
        <span>›</span>
        <span>Lands in your inbox</span>
      </div>
      <Link to="/app/radar"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-mint text-background text-[12px] font-semibold">
        <Plus className="size-3.5" /> Create Radar
      </Link>
    </div>
  );
}

function AssetsTile({ portfolio }: { portfolio: Portfolio | null }) {
  if (!portfolio) return <SkeletonRows />;
  if (portfolio.errors?.length) return <UnavailableState label="complete asset balances" />;
  const total = portfolio.superBalance + portfolio.investments + portfolio.property + portfolio.cash;
  const rows = [
    { label: "Super", v: portfolio.superBalance },
    { label: "Investments", v: portfolio.investments },
    { label: "Property", v: portfolio.property },
    { label: "Cash", v: portfolio.cash },
  ].filter((r) => r.v > 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] text-muted-foreground">All Assets</span>
        <span className="text-[13px] font-semibold tabular-nums">{formatAUD(total)}</span>
      </div>
      {rows.length === 0 && <p className="text-[12px] text-muted-foreground">No assets yet.</p>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.v / total) * 100) : 0;
          return (
            <li key={r.label}>
              <div className="flex justify-between text-[12px]"><span>{r.label}</span><span className="tabular-nums">{formatAUD(r.v)}</span></div>
              <div className="h-1 mt-1 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-mint" style={{ width: `${pct}%` }} /></div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{pct}%</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-3"><SourceBadge source={portfolio.provenance?.assets ?? "manual"} label="Asset balance sources" /></div>
    </div>
  );
}

function LiabilitiesTile({ portfolio }: { portfolio: Portfolio | null }) {
  if (!portfolio) return <SkeletonRows />;
  if (portfolio.errors?.length) return <UnavailableState label="complete liability balances" />;
  const total = portfolio.propertyDebt + portfolio.otherDebt;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[11px] text-muted-foreground">Total Liabilities</span>
        <span className="text-[13px] font-semibold tabular-nums">{formatAUD(total)}</span>
      </div>
      {total === 0 ? (
        <Link to="/app/assets" search={{ add: "liability" }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[hsl(0_70%_55%)] text-white">
          <Plus className="size-3.5" /> Add Liability
        </Link>
      ) : (
        <ul className="space-y-1.5 text-[12px]">
          <li className="flex justify-between"><span>Mortgages</span><span className="tabular-nums">{formatAUD(portfolio.propertyDebt)}</span></li>
          <li className="flex justify-between"><span>Other debt</span><span className="tabular-nums">{formatAUD(portfolio.otherDebt)}</span></li>
        </ul>
      )}
      {total > 0 && <div className="mt-3"><SourceBadge source={portfolio.provenance?.debts ?? "manual"} /></div>}
    </div>
  );
}

function SetupTile({ portfolio }: { portfolio: Portfolio | null }) {
  // Goal/document completion from the real records (same sources getActivation
  // uses); failures leave the step incomplete rather than fabricating progress.
  const [hasGoal, setHasGoal] = useState(false);
  const [hasDoc, setHasDoc] = useState(false);
  const [setupState, setSetupState] = useState<"loading" | "ready" | "error">("loading");
  const loadSetup = useCallback(async () => {
    setSetupState("loading");
    try {
      const [g, d] = await Promise.all([listGoals(), listVault()]);
      setHasGoal(Array.isArray(g) && g.length > 0);
      setHasDoc(Array.isArray(d) && d.length > 0);
      setSetupState("ready");
    } catch {
      setSetupState("error");
    }
  }, []);
  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);
  if (setupState === "loading") return <SkeletonRows />;
  if (setupState === "error") return <UnavailableState label="setup progress" onRetry={loadSetup} />;
  const steps = [
    { label: "Connect your first account", done: !!portfolio && portfolio.cash > 0 },
    { label: "Add an asset", done: !!portfolio && (portfolio.investments + portfolio.property + portfolio.superBalance) > 0 },
    { label: "Add a liability", done: !!portfolio && (portfolio.propertyDebt + portfolio.otherDebt) > 0 },
    { label: "Set your first goal", done: hasGoal },
    { label: "Upload a financial document", done: hasDoc },
  ];
  const pct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold">Setup is {pct}% complete</p>
        <span className="text-[12px] font-bold text-mint">{pct}%</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Complete these steps to unlock Maal's full insights.</p>
      <ul className="space-y-1.5 text-[12px]">
        {steps.map((s) => (
          <li key={s.label} className={`flex items-center gap-2 ${s.done ? "text-muted-foreground line-through" : ""}`}>
            <span className={`size-3.5 rounded-full grid place-items-center text-[8px] ${s.done ? "bg-mint text-background" : "border border-border"}`}>{s.done ? "✓" : ""}</span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaxTile({ portfolio }: { portfolio: Portfolio | null }) {
  // Tax on gains needs cost-base data we don't collect yet — show an explicit
  // unavailable state rather than a fabricated $0.
  const adjustedNW = portfolio ? portfolio.superBalance + portfolio.investments + portfolio.property + portfolio.cash - portfolio.propertyDebt - portfolio.otherDebt : null;
  return (
    <div>
      <div className="rounded-[10px] border border-border p-3 mb-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Estimated Tax on Gains</p>
        <p className="text-[18px] font-bold tabular-nums">—</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Not available yet</p>
      </div>
      <div className="rounded-[10px] border border-border p-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Adjusted Net Worth</p>
        <p className="text-[18px] font-bold tabular-nums">{adjustedNW === null ? "—" : formatAUD(adjustedNW)}</p>
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1"><Info className="size-3" /> Indicative only — not financial advice.</p>
    </div>
  );
}

function MarketTile() {
  const { items: rawItems, state, retry } = useAsyncList(getMarketIndices);
  const items = rawItems.filter((x: any) => x && x.price != null);
  const focus = items.find((i) => String(i.name).startsWith("S&P 500")) ?? items[0];
  if (state === "loading") return <SkeletonRows />;
  if (state === "error") return <UnavailableState label="market data" onRetry={retry} />;
  if (!focus) {
    return <p className="text-[11px] text-muted-foreground">Market data unavailable right now — check back shortly.</p>;
  }
  return (
    <div>
      {!focus ? <SkeletonRows /> : (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-semibold">{focus.name}</span>
            <span className={focus.changePercent >= 0 ? "text-mint" : "text-[hsl(0_70%_55%)]"}>{focus.changePercent >= 0 ? "▲" : "▼"} {focus.changePercent.toFixed(2)}%</span>
          </div>
          <p className="text-[13px] tabular-nums">
            {focus.price.toLocaleString()}
            {focus.currency ? <span className="text-muted-foreground text-[11px] ml-1">{focus.currency}</span> : null}
          </p>
        </div>
      )}
      <ul className="space-y-1.5">
        {items.slice(0, 5).map((i) => (
          <li key={i.symbol} className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">{i.name}</span>
            <span className={i.changePercent >= 0 ? "text-mint" : "text-[hsl(0_70%_55%)]"}>{i.changePercent >= 0 ? "+" : ""}{i.changePercent.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      {items.some((i) => i.isProxy) && (
        <p className="text-[10px] text-muted-foreground mt-3">ETF share prices in USD, used as proxies for their indices — not index levels.</p>
      )}
    </div>
  );
}

function NewsTile() {
  const { items, state, retry } = useAsyncList(getMarketNews);
  if (state === "loading") return <SkeletonRows />;
  if (state === "error") return <UnavailableState label="market news" onRetry={retry} />;
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">No market news is available right now.</p>;
  return (
    <ul className="space-y-2.5">
      {items.slice(0, 4).map((n, i) => (
        <li key={i}>
          <a href={n.url} target="_blank" rel="noreferrer" className="block hover:text-mint">
            <p className="text-[12px] leading-snug line-clamp-2">{n.headline}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{n.source}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}

function RunwayTile({ portfolio, monthlyExpenses }: { portfolio: Portfolio | null; monthlyExpenses: number | null }) {
  // Runway = cash on hand ÷ monthly burn (the user's monthly expenses from
  // their profile). Without a burn figure we can't compute months — point the
  // user at their profile instead of fabricating a number.
  const cash = portfolio?.cash ?? null;
  const burn = monthlyExpenses && monthlyExpenses > 0 ? monthlyExpenses : null;
  const months = cash != null && burn ? cash / burn : null;
  return (
    <div className="text-center py-3">
      <p className="text-[40px] font-bold tabular-nums">{months == null ? "—" : months >= 99 ? "99+" : months.toFixed(1)}</p>
      <p className="text-[11px] text-muted-foreground">Months</p>
      <div className="grid grid-cols-2 gap-3 mt-4 text-left">
        <div>
          <p className="text-[16px] font-semibold tabular-nums">{burn ? formatAUD(burn) : "—"}</p>
          <p className="text-[10px] text-muted-foreground">
            {burn ? "Monthly Burn" : <>Monthly Burn · <Link to="/app/onboarding" className="underline">set monthly expenses</Link></>}
          </p>
        </div>
        <div>
          <p className="text-[16px] font-semibold tabular-nums">{portfolio ? formatAUD(portfolio.cash) : "—"}</p>
          <p className="text-[10px] text-muted-foreground">Cash On Hand</p>
        </div>
      </div>
      {months != null && <div className="mt-3 flex justify-center"><SourceBadge source="calculated" label="Calculated from cash and monthly expenses" /></div>}
    </div>
  );
}

function Placeholder({ title, hint, cta, to }: { title: string; hint: string; cta: string; to: string }) {
  return (
    <div className="text-center py-6">
      <p className="text-[13px] font-semibold mb-1">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-4 max-w-[28ch] mx-auto leading-snug">{hint}</p>
      <Link to={to} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-mint text-background hover:opacity-90">
        <ArrowUpRight className="size-3.5" /> {cta}
      </Link>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => <div key={i} className="h-3 rounded bg-secondary animate-pulse" style={{ width: `${80 - i * 15}%` }} />)}
    </div>
  );
}

function SkeletonKpi() {
  return (
    <div aria-label="Loading dashboard value" className="space-y-3">
      <div className="h-14 w-full rounded-[8px] bg-secondary animate-pulse" />
      <div className="h-7 w-28 rounded bg-secondary animate-pulse" />
      <div className="h-3 w-20 rounded bg-secondary animate-pulse" />
    </div>
  );
}

function UnavailableState({ label, onRetry }: { label: string; onRetry?: () => void | Promise<void> }) {
  return (
    <div className="rounded-[10px] border border-[var(--gold)]/30 bg-[var(--gold)]/5 p-3">
      <p className="text-[12px] font-semibold">Couldn’t load {label}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">No zero or placeholder value has been substituted.</p>
      {onRetry && (
        <button onClick={() => void onRetry()} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-mint hover:underline">
          <RefreshCw className="size-3" /> Retry
        </button>
      )}
    </div>
  );
}

function SourceBadge({ source, label }: { source: "manual" | "connected" | "mixed" | "calculated"; label?: string }) {
  const text = source === "connected" ? "Connected data"
    : source === "mixed" ? "Manual + connected"
    : source === "calculated" ? "Calculated"
    : "Manual data";
  return (
    <span title={label ?? text} className="mt-1 inline-flex rounded-full border border-border bg-secondary/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {text}
    </span>
  );
}
