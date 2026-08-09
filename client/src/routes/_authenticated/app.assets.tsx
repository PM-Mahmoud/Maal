import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase, handleUnauthenticated } from "@/integrations/api";
import { toast } from "sonner";
import { formatAUD } from "@/lib/score";
import { INSTITUTIONS } from "@/lib/institutions";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Landmark,
  Home,
  PiggyBank,
  LineChart,
  Briefcase,
  Car,
  Award,
  Anchor,
  CreditCard,
  TrendingDown,
  HandCoins,
  ShieldCheck,
  Plus,
  Pencil,
  X,
  LayoutGrid,
  List as ListIcon,
  Search,
  Lock,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/assets")({
  validateSearch: (search: Record<string, unknown>) => ({
    add: search.add === "asset" || search.add === "liability" ? search.add : undefined,
  }),
  component: PortfolioPage,
});

/* ------------------------------------------------------------------ */
/*  Catalogue                                                          */
/* ------------------------------------------------------------------ */

type CatKey =
  | "bank"
  | "super"
  | "property_mortgage"
  | "real_estate"
  | "crypto"
  | "public"
  | "private"
  | "vehicle"
  | "metal"
  | "collectible"
  | "other_asset"
  | "credit_card"
  | "loan"
  | "other_liability";

type Cat = {
  key: CatKey;
  side: "asset" | "liability";
  group: "accounts" | "assets" | "liabilities";
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ className?: string }>;
  table: "cash_accounts" | "investments" | "properties" | "debts" | "super_accounts" | "other_assets";
  filter?: { key: string; values: string[] }; // narrow rows of shared tables
  amountKey: string;
  nameKey: string;
  // Optional liability column on the same row to net against the amount when
  // totalling (e.g. a property's mortgage_balance → the total shows equity).
  netAgainst?: string;
};

/** Row amount used for category totals — net of any same-row liability. */
function rowAmount(cat: Cat, r: any): number {
  const gross = Number(r[cat.amountKey] ?? 0);
  return cat.netAgainst ? gross - Number(r[cat.netAgainst] ?? 0) : gross;
}

const CATS: Cat[] = [
  { key: "bank", side: "asset", group: "accounts", title: "Banks & Brokerages", blurb: "Banking and brokerage accounts", Icon: Landmark, table: "cash_accounts", amountKey: "balance", nameKey: "label" },
  { key: "public", side: "asset", group: "accounts", title: "Investment Accounts", blurb: "Stocks, ETFs and managed funds", Icon: LineChart, table: "investments", filter: { key: "kind", values: ["etf", "stock", "managed_fund", "other"] }, amountKey: "value", nameKey: "name" },
  { key: "super", side: "asset", group: "accounts", title: "Superannuation", blurb: "Super funds and retirement savings", Icon: PiggyBank, table: "super_accounts", amountKey: "balance", nameKey: "label" },

  { key: "real_estate", side: "asset", group: "assets", title: "Real Estate", blurb: "Residential & commercial property", Icon: Home, table: "properties", amountKey: "value", nameKey: "label" },
  { key: "crypto", side: "asset", group: "assets", title: "Crypto Holdings", blurb: "Wallets, exchanges and on-chain", Icon: PiggyBank, table: "investments", filter: { key: "kind", values: ["crypto"] }, amountKey: "value", nameKey: "name" },
  { key: "private", side: "asset", group: "assets", title: "Private Investments", blurb: "PE, VC, SAFEs & angel deals", Icon: Briefcase, table: "other_assets", filter: { key: "kind", values: ["private_investment"] }, amountKey: "value", nameKey: "label" },
  { key: "vehicle", side: "asset", group: "assets", title: "Vehicles", blurb: "Cars and other vehicles", Icon: Car, table: "other_assets", filter: { key: "kind", values: ["vehicle"] }, amountKey: "value", nameKey: "label" },
  { key: "metal", side: "asset", group: "assets", title: "Precious Metals", blurb: "Gold, silver and physical metals", Icon: Award, table: "other_assets", filter: { key: "kind", values: ["metal"] }, amountKey: "value", nameKey: "label" },
  { key: "collectible", side: "asset", group: "assets", title: "Collectibles & Luxury", blurb: "Watches, art, trading cards", Icon: Anchor, table: "other_assets", filter: { key: "kind", values: ["collectible"] }, amountKey: "value", nameKey: "label" },
  { key: "other_asset", side: "asset", group: "assets", title: "Other Assets", blurb: "Anything else of value", Icon: Anchor, table: "other_assets", filter: { key: "kind", values: ["other"] }, amountKey: "value", nameKey: "label" },

  { key: "credit_card", side: "liability", group: "liabilities", title: "Credit Cards", blurb: "Personal & business cards", Icon: CreditCard, table: "debts", filter: { key: "kind", values: ["credit_card"] }, amountKey: "balance", nameKey: "label" },
  { key: "property_mortgage", side: "liability", group: "liabilities", title: "Property Mortgages", blurb: "Mortgages linked to your properties", Icon: Home, table: "properties", amountKey: "mortgage_balance", nameKey: "label" },
  { key: "loan", side: "liability", group: "liabilities", title: "Mortgages & Loans", blurb: "Mortgages, personal & car loans", Icon: TrendingDown, table: "debts", filter: { key: "kind", values: ["mortgage", "personal", "car", "hecs"] }, amountKey: "balance", nameKey: "label" },
  { key: "other_liability", side: "liability", group: "liabilities", title: "Other Liabilities", blurb: "Taxes owed, private debts", Icon: HandCoins, table: "debts", filter: { key: "kind", values: ["other"] }, amountKey: "balance", nameKey: "label" },
];

const ASSET_CATS = CATS.filter((c) => c.side === "asset");
const LIABILITY_CATS = CATS.filter((c) => c.side === "liability");

export type WealthSection = "overview" | "cash" | "investments" | "property" | "super" | "liabilities" | "other";

const WEALTH_SECTIONS: Record<Exclude<WealthSection, "overview">, { title: string; description: string; keys: CatKey[] }> = {
  cash: { title: "Cash", description: "Bank accounts, savings, offsets and term deposits.", keys: ["bank"] },
  investments: { title: "Investments", description: "Listed investments, managed funds and crypto holdings.", keys: ["public", "crypto"] },
  property: { title: "Property", description: "Property values, mortgages and the equity you own.", keys: ["real_estate", "property_mortgage"] },
  super: { title: "Super", description: "Your superannuation funds and retirement savings.", keys: ["super"] },
  liabilities: { title: "Liabilities", description: "Credit cards, mortgages, loans and other obligations.", keys: ["property_mortgage", "credit_card", "loan", "other_liability"] },
  other: { title: "Other Assets", description: "Private investments, metals, vehicles, collectibles and other valuables.", keys: ["private", "metal", "vehicle", "collectible", "other_asset"] },
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function WealthPortfolioPage({ section = "overview", initialAdd }: { section?: WealthSection; initialAdd?: "asset" | "liability" }) {
  const [view, setView] = useState<"cards" | "list">("cards");
  const [activeCat, setActiveCat] = useState<Cat | null>(null);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [bumps, setBumps] = useState(0);

  useEffect(() => {
    if (initialAdd === "asset") setActiveCat(CATS.find((cat) => cat.key === "bank") ?? null);
    if (initialAdd === "liability") setActiveCat(CATS.find((cat) => cat.key === "credit_card") ?? null);
  }, [initialAdd]);

  const sectionConfig = section === "overview" ? null : WEALTH_SECTIONS[section];
  const sectionCats = sectionConfig ? CATS.filter((cat) => sectionConfig.keys.includes(cat.key)) : [];
  const openAdd = (cat: Cat) => { setEditingRow(null); setActiveCat(cat); };
  const openEdit = (cat: Cat, row: any) => { setEditingRow(row); setActiveCat(cat); };

  return (
    <div className="px-4 sm:px-6 md:px-10 py-6 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1">My Wealth</p>
          <h1 className="text-[28px] tracking-display font-bold leading-tight">{sectionConfig?.title ?? "Overview"}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">{sectionConfig?.description ?? "One reconciled view of everything you own and owe."}</p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {section === "overview" && <WealthSummary />}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8 items-start">
        {/* Main column: 3 sections */}
        <div className="space-y-10 min-w-0">
          {sectionConfig ? (
            <PortfolioSection key={`${section}-${bumps}`} title={sectionConfig.title} cats={sectionCats} view={view} onAdd={openAdd} onEdit={openEdit} />
          ) : (
            <>
              <PortfolioSection key={`accounts-${bumps}`} title="Accounts" cats={CATS.filter((c) => c.group === "accounts")} view={view} onAdd={openAdd} onEdit={openEdit} />
              <PortfolioSection key={`assets-${bumps}`} title="Assets" cats={CATS.filter((c) => c.group === "assets")} view={view} onAdd={openAdd} onEdit={openEdit} />
              <PortfolioSection key={`liab-${bumps}`} title="Liabilities" cats={CATS.filter((c) => c.group === "liabilities")} view={view} onAdd={openAdd} onEdit={openEdit} />
            </>
          )}

          <p className="text-[11px] text-muted-foreground pt-6 text-center">
            Maal does not provide financial advice. Information is for educational purposes only.
          </p>
        </div>

        {/* Right rail */}
        <aside className="space-y-4 xl:sticky xl:top-6">
          <AddPanel onPick={openAdd} />
          {(section === "overview" || section === "cash") && <ConnectPanel />}
        </aside>
      </div>

      <FormDialog
        cat={activeCat}
        row={editingRow}
        onClose={() => { setActiveCat(null); setEditingRow(null); }}
        onSaved={() => {
          setActiveCat(null);
          setEditingRow(null);
          setBumps((b) => b + 1);
        }}
      />
    </div>
  );
}

function WealthSummary() {
  const [summary, setSummary] = useState<{ assetTotal: number; liabilityTotal: number; netWorth: number; components: Record<string, number> } | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<{ date: string; netWorth: number } | null>(null);

  useEffect(() => {
    fetch("/api/v1/wealth-summary", { credentials: "include" })
      .then((response) => {
        if (response.status === 401) handleUnauthenticated();
        if (!response.ok) throw new Error("Could not load wealth summary");
        return response.json();
      })
      .then(setSummary)
      .catch(() => toast.error("Could not load wealth totals"));
  }, []);

  useEffect(() => {
    fetch("/api/v1/snapshots?days=1", { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => setLatestSnapshot(Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null))
      .catch(() => setLatestSnapshot(null));
  }, []);

  const cards = [
    { label: "Net worth", value: summary?.netWorth },
    { label: "Total assets", value: summary?.assetTotal },
    { label: "Total liabilities", value: summary?.liabilityTotal },
  ];
  const trackedClasses = summary ? [
    summary.components.cashTotal,
    summary.components.investmentsTotal,
    summary.components.propertyTotal,
    summary.components.superTotal,
    summary.components.otherAssetsTotal,
  ].filter((value) => Number(value) !== 0).length : 0;

  return (
    <section aria-label="Wealth totals" className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[12px] border border-border bg-[var(--surface)] px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-[20px] font-bold tabular-nums">{card.value === undefined ? "—" : formatAUD(card.value)}</p>
        </div>
      ))}
      {summary && trackedClasses < 5 && (
        <p className="sm:col-span-3 text-[11px] text-muted-foreground">
          Wealth baseline: {trackedClasses} of 5 asset classes tracked. Add missing assets so your net worth and future service calculations are complete.
        </p>
      )}
      {summary && latestSnapshot && (
        <p className="sm:col-span-3 text-[11px] text-muted-foreground">
          Latest daily snapshot ({new Date(`${latestSnapshot.date}T00:00:00`).toLocaleDateString("en-AU")}): {formatAUD(latestSnapshot.netWorth)}
          {latestSnapshot.netWorth !== summary.netWorth ? ` · current wealth has changed by ${formatAUD(summary.netWorth - latestSnapshot.netWorth)}` : " · reconciled with current wealth"}.
        </p>
      )}
    </section>
  );
}

function PortfolioPage() {
  const { add } = Route.useSearch();
  return <WealthPortfolioPage initialAdd={add === "asset" || add === "liability" ? add : undefined} />;
}

/* ------------------------------------------------------------------ */
/*  View toggle                                                        */
/* ------------------------------------------------------------------ */

function ViewToggle({ view, onChange }: { view: "cards" | "list"; onChange: (v: "cards" | "list") => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-[var(--surface)] p-1 text-[12px] font-semibold">
      {([
        { key: "cards", label: "Cards", Icon: LayoutGrid },
        { key: "list", label: "List", Icon: ListIcon },
      ] as const).map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
            view === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section (title + grid of category cards / list)                    */
/* ------------------------------------------------------------------ */

function PortfolioSection({
  title,
  cats,
  view,
  onAdd,
  onEdit,
}: {
  title: string;
  cats: Cat[];
  view: "cards" | "list";
  onAdd: (c: Cat) => void;
  onEdit: (c: Cat, row: any) => void;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-bold tracking-display text-muted-foreground mb-3">{title}</h2>
      {view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cats.map((c) => <CategoryCard key={c.key} cat={c} onAdd={onAdd} onEdit={onEdit} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {cats.map((c) => <CategoryRow key={c.key} cat={c} onAdd={onAdd} onEdit={onEdit} />)}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Category card / row                                                */
/* ------------------------------------------------------------------ */

function useCategoryRows(cat: Cat) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    let q = (supabase.from(cat.table) as any).select("*").order("created_at", { ascending: true });
    if (cat.filter) q = q.in(cat.filter.key, cat.filter.values);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [cat.key]);

  async function deleteRow(id: string) {
    const { error } = await (supabase.from(cat.table) as any).delete().eq("id", id);
    if (error) toast.error(error.message); else setRows((r) => r.filter((x) => x.id !== id));
  }

  return { rows, loading, deleteRow, reload };
}

function CategoryCard({ cat, onAdd, onEdit }: { cat: Cat; onAdd: (c: Cat) => void; onEdit: (c: Cat, row: any) => void }) {
  const { rows, loading, deleteRow } = useCategoryRows(cat);
  const total = rows.reduce((a, r) => a + rowAmount(cat, r), 0);
  const isEmpty = !loading && rows.length === 0;
  const latestUpdate = rows.reduce<string | null>((latest, row) => {
    const candidate = row.updated_at || row.created_at;
    return candidate && (!latest || candidate > latest) ? candidate : latest;
  }, null);

  return (
    <div className="rounded-[14px] border border-border bg-[var(--surface)] overflow-hidden flex flex-col min-h-[200px]">
      {/* Header */}
      <button
        onClick={() => onAdd(cat)}
        className="group flex items-center justify-between px-4 py-3 border-b border-border text-left hover:bg-[var(--secondary)]/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <cat.Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-[13px] font-semibold tracking-tight truncate">{cat.title}</p>
        </div>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground group-hover:text-foreground group-hover:bg-foreground/5 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* Body */}
      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="p-4 text-[12px] text-muted-foreground">Loading…</div>
        ) : isEmpty ? (
          <button
            onClick={() => onAdd(cat)}
            className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:text-foreground hover:bg-[var(--secondary)]/40 transition-colors"
            aria-label={`Add ${cat.title}`}
          >
            <Plus className="h-6 w-6 opacity-40" />
            <span className="text-[11px]">{cat.blurb}</span>
          </button>
        ) : (
          <>
            <ul className="divide-y divide-border flex-1">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {(r.institution || r.ticker || r.account_type) && (
                      <InstitutionLogo
                        name={r.institution || r.ticker || r.account_type}
                        logoUrl={r.logo_url}
                        size={28}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{r[cat.nameKey] || "Untitled"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[color:var(--accent)]/12 text-[color:var(--accent)] text-[10px] font-semibold mr-1.5">{sourceLabel(r.source)}</span>
                        {r.institution || r.ticker || r.account_type || r.kind || cat.title}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-[13px] font-semibold">{formatAUD(Number(r[cat.amountKey] ?? 0))}</span>
                    <button onClick={() => onEdit(cat, r)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]" aria-label={`Edit ${r[cat.nameKey] || cat.title}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteRow(r.id)}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground transition-opacity rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {/* Footer total */}
            <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">{rows.length} {rows.length === 1 ? "entry" : "entries"}{latestUpdate ? ` · updated ${new Date(latestUpdate).toLocaleDateString("en-AU")}` : ""}</span>
              <span className="tabular-nums font-semibold">{cat.netAgainst ? "equity = " : "= "}{formatAUD(total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ cat, onAdd, onEdit }: { cat: Cat; onAdd: (c: Cat) => void; onEdit: (c: Cat, row: any) => void }) {
  const { rows, deleteRow } = useCategoryRows(cat);
  const total = rows.reduce((a, r) => a + rowAmount(cat, r), 0);

  return (
    <div className="rounded-[12px] border border-border bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <cat.Icon className="h-4 w-4 text-muted-foreground" />
          <p className="text-[13px] font-semibold">{cat.title}</p>
          <span className="text-[11px] text-muted-foreground">· {rows.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-[13px] font-semibold">{formatAUD(total)}</span>
          <button onClick={() => onAdd(cat)} className="text-muted-foreground hover:text-foreground" aria-label={`Add ${cat.title}`}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2 flex items-center justify-between text-[13px] group">
              <span className="truncate">
                {r[cat.nameKey] || "Untitled"}
                <span className="ml-1 text-[10px] text-muted-foreground">{sourceLabel(r.source)}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{formatAUD(Number(r[cat.amountKey] ?? 0))}</span>
                <button onClick={() => onEdit(cat, r)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]" aria-label={`Edit ${r[cat.nameKey] || cat.title}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteRow(r.id)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]" aria-label="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sourceLabel(source: unknown) {
  if (source === "basiq") return "Connected";
  if (source === "lunchflow") return "Lunch Flow";
  if (source === "import") return "Imported";
  if (source === "manual") return "Manual";
  return "Source unavailable";
}

/* ------------------------------------------------------------------ */
/*  Right rail: Add panel                                              */
/* ------------------------------------------------------------------ */

function AddPanel({ onPick }: { onPick: (c: Cat) => void }) {
  const [side, setSide] = useState<"asset" | "liability">("asset");
  const cats = side === "asset" ? ASSET_CATS : LIABILITY_CATS;

  return (
    <div className="rounded-[14px] border border-border bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold tracking-tight">
          {side === "asset" ? "Add an Asset" : "Add a Liability"}
        </h3>
        <div className="inline-flex items-center rounded-full border border-border p-0.5 text-[11px] font-semibold">
          <button
            onClick={() => setSide("asset")}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              side === "asset" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Assets
          </button>
          <button
            onClick={() => setSide("liability")}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              side === "liability" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Liabilities
          </button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {cats.map((c) => (
          <li key={c.key}>
            <button
              onClick={() => onPick(c)}
              className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] border border-border hover:border-foreground/30 hover:bg-[var(--secondary)]/60 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate">{c.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{c.blurb}</p>
              </div>
              <c.Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Right rail: Connect Accounts panel (visual stub)                   */
/* ------------------------------------------------------------------ */

/** Banks shown in the Connect Accounts panel, in display order. Brand colors,
 *  logos and display names come from the shared registry in lib/institutions. */
const CONNECT_BANKS: string[] = [
  "commbank",
  "anz",
  "westpac",
  "nab",
  "macquarie",
  "bendigo",
  "ing",
  "ubank",
  "hsbc",
  "stgeorge",
  "banksa",
  "suncorp",
];

function ConnectPanel() {
  const [status, setStatus] = useState<{ connected: boolean; live: boolean } | null>(null);
  const [lunchFlowStatus, setLunchFlowStatus] = useState<{ connected: boolean; live: boolean } | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lunchFlowSyncing, setLunchFlowSyncing] = useState(false);
  const [lunchFlowMsg, setLunchFlowMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/basiq/status", { credentials: "include" })
      .then(r => {
        if (r.status === 401) handleUnauthenticated();
        return r.ok ? r.json() : null;
      })
      .then(j => (j && typeof j.live === "boolean" ? setStatus(j) : setStatusFailed(true)))
      .catch(() => setStatusFailed(true));
    fetch("/lunchflow/status", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(j => j && typeof j.live === "boolean" ? setLunchFlowStatus(j) : null)
      .catch(() => null);
  }, []);

  async function handleLunchFlowSync() {
    setLunchFlowSyncing(true);
    setLunchFlowMsg(null);
    try {
      const response = await fetch("/lunchflow/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Lunch Flow sync failed");
      setLunchFlowMsg("Lunch Flow sync queued…");
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 1000));
        const statusResponse = await fetch(`/api/v1/import-runs/${encodeURIComponent(result.import_run_id)}`, { credentials: "include" });
        if (!statusResponse.ok) throw new Error("Could not check Lunch Flow sync progress");
        const { import_run: run } = await statusResponse.json();
        if (run.status === "succeeded") {
          const accounts = Number(run.summary?.accounts ?? 0);
          const transactions = Number(run.summary?.transactions ?? 0);
          const holdings = Number(run.summary?.holdings ?? 0);
          setLunchFlowMsg(`Synced ${accounts} account${accounts === 1 ? "" : "s"}, ${transactions} transactions, and ${holdings} holding${holdings === 1 ? "" : "s"}.`);
          window.setTimeout(() => window.location.reload(), 700);
          return;
        }
        if (run.status === "dead") throw new Error(run.last_error || "Lunch Flow sync failed after several attempts");
        setLunchFlowMsg(run.status === "retrying" ? "Lunch Flow is temporarily unavailable — retrying…" : `Syncing ${run.current_stage || "accounts"}…`);
      }
      setLunchFlowMsg("Sync is taking longer than expected. You can safely leave this page.");
    } catch (error) {
      setLunchFlowMsg(error instanceof Error ? error.message : "Lunch Flow sync failed.");
    } finally {
      setLunchFlowSyncing(false);
    }
  }

  async function handleLunchFlowDisconnect() {
    if (!window.confirm("Disconnect Lunch Flow and remove its stored access tokens?")) return;
    const response = await fetch("/lunchflow/disconnect", { method: "POST", credentials: "include" });
    const result = await response.json();
    if (!response.ok) { setLunchFlowMsg(result.error || "Could not disconnect Lunch Flow."); return; }
    setLunchFlowStatus(current => current ? { ...current, connected: false } : current);
    setLunchFlowMsg(result.remote_revoke_failed ? "Disconnected locally. Lunch Flow could not confirm remote revocation; review access in Lunch Flow." : "Lunch Flow disconnected.");
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch("/api/v1/basiq/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const j = await r.json();
      if (!r.ok || !j.import_run_id) {
        setSyncMsg(j.error || "Sync failed.");
        return;
      }
      setSyncMsg("Sync queued — securely importing your latest data…");
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 1000));
        const statusResponse = await fetch(
          `/api/v1/import-runs/${encodeURIComponent(j.import_run_id)}`,
          { credentials: "include" }
        );
        if (statusResponse.status === 401) {
          handleUnauthenticated();
          return;
        }
        if (!statusResponse.ok) throw new Error("Could not check sync progress");
        const { import_run: run } = await statusResponse.json();
        if (run.status === "succeeded") {
          const accounts = Number(run.summary?.accounts ?? 0);
          setSyncMsg(`Synced ${accounts} account${accounts === 1 ? "" : "s"} — balances updated.`);
          window.location.reload();
          return;
        }
        if (run.status === "dead") {
          setSyncMsg(run.last_error || "Sync failed after several attempts.");
          return;
        }
        setSyncMsg(run.status === "retrying"
          ? "Your bank is temporarily unavailable — retrying automatically…"
          : `Syncing ${run.current_stage || "your accounts"}…`);
      }
      setSyncMsg("Sync is taking longer than expected. You can leave this page and try again later.");
    } catch {
      setSyncMsg("Sync failed — check your connection.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-border bg-[var(--surface)] p-4">
      <h3 className="text-[14px] font-bold tracking-tight mb-3">Connect Accounts</h3>

      {status?.live ? (
        <div className="space-y-3">
          {status.connected ? (
            <>
              <div className="flex items-center gap-2 text-[12px] text-[var(--mint)] font-medium">
                <span className="size-2 rounded-full bg-[var(--mint)]" />
                Open Banking connected
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="w-full py-2 rounded-[10px] bg-foreground text-background text-[12px] font-semibold disabled:opacity-50 transition"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[12px] text-muted-foreground mb-2">Connect your bank to auto-import balances and transactions via Open Banking (CDR).</p>
              <a
                href="/basiq/connect"
                className="block w-full py-2 rounded-[10px] bg-foreground text-background text-[12px] font-semibold text-center transition hover:opacity-90"
              >
                Connect your bank
              </a>
            </>
          )}
          {syncMsg && <p className="text-[11px] text-muted-foreground mt-2">{syncMsg}</p>}

          <div className="grid grid-cols-3 gap-2 mt-2">
            {CONNECT_BANKS.slice(0, 9).map((slug) => {
              const info = INSTITUTIONS[slug];
              if (!info) return null;
              return (
                <div
                  key={slug}
                  title={info.name}
                  className="aspect-square rounded-[10px] flex items-center justify-center"
                >
                  <InstitutionLogo name={info.name} size={44} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {CONNECT_BANKS.map((slug) => {
              const info = INSTITUTIONS[slug];
              if (!info) return null;
              return (
                <div
                  key={slug}
                  title={info.name}
                  className="aspect-square rounded-[10px] flex items-center justify-center opacity-40"
                >
                  <InstitutionLogo name={info.name} size={44} />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {status === null
              ? (statusFailed ? "Couldn't check Open Banking status — refresh to try again." : "Checking Open Banking status…")
              : "Open Banking connections are coming soon."}
          </p>
        </>
      )}

      {lunchFlowStatus?.live && (
        <div className="border-t border-border pt-3 mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold">Lunch Flow</p>
              <p className="text-[11px] text-muted-foreground">
                {lunchFlowStatus.connected ? "Connected as an additional data provider" : "Global bank and brokerage coverage"}
              </p>
            </div>
            {lunchFlowStatus.connected && <span className="size-2 rounded-full bg-[var(--mint)] shrink-0" />}
          </div>
          {lunchFlowStatus.connected ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleLunchFlowSync}
                disabled={lunchFlowSyncing}
                className="w-full py-2 rounded-[10px] border border-border text-[12px] font-semibold disabled:opacity-50 transition hover:bg-[var(--secondary)]"
              >
                {lunchFlowSyncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                onClick={handleLunchFlowDisconnect}
                disabled={lunchFlowSyncing}
                className="w-full py-2 rounded-[10px] border border-border text-[12px] font-semibold text-muted-foreground disabled:opacity-50 transition hover:bg-[var(--secondary)]"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <a
              href="/lunchflow/connect"
              className="block w-full py-2 rounded-[10px] border border-border text-[12px] font-semibold text-center transition hover:bg-[var(--secondary)]"
            >
              Connect with Lunch Flow
            </a>
          )}
          {lunchFlowMsg && <p className="text-[11px] text-muted-foreground">{lunchFlowMsg}</p>}
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground border-t border-border pt-3 mt-3">
        <Lock className="h-3 w-3 mt-0.5 shrink-0 text-[color:var(--accent)]" />
        <p><span className="font-semibold text-foreground">Your data is secure.</span> Basiq and Lunch Flow connections are read-only.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form dialog (manual entry per category)                            */
/* ------------------------------------------------------------------ */

type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  full?: boolean;
  hint?: string;
  required?: boolean;
};

type FormSpec = {
  table: "cash_accounts" | "investments" | "properties" | "debts" | "super_accounts" | "other_assets";
  title: string;
  blurb: string;
  fields: FieldSpec[];
  buildPayload: (values: Record<string, any>) => Record<string, any>;
};

function specFor(cat: Cat): FormSpec {
  switch (cat.key) {
    case "bank":
      return {
        table: "cash_accounts",
        title: "Add Account",
        blurb: "Add a bank, savings, offset or brokerage account.",
        fields: [
          { key: "label", label: "Account name", placeholder: "e.g. CommBank Smart Access", full: true, required: true },
          { key: "institution", label: "Institution", placeholder: "e.g. CommBank" },
          { key: "account_type", label: "Account type", type: "select", options: [
            { value: "savings", label: "Savings" },
            { value: "transaction", label: "Transaction" },
            { value: "offset", label: "Offset" },
            { value: "term_deposit", label: "Term deposit" },
          ]},
          { key: "balance", label: "Balance (AUD)", type: "number", placeholder: "0.00", required: true },
        ],
        buildPayload: (v) => ({ label: v.label, institution: v.institution || null, account_type: v.account_type || "savings", balance: Number(v.balance || 0) }),
      };
    case "super":
      return {
        table: "super_accounts",
        title: "Add Super Fund",
        blurb: "Add a superannuation fund and its latest balance.",
        fields: [
          { key: "label", label: "Account name", placeholder: "e.g. AustralianSuper", full: true, required: true },
          { key: "fund_name", label: "Fund", placeholder: "e.g. AustralianSuper" },
          { key: "balance", label: "Current balance (AUD)", type: "number", required: true },
          { key: "employer_contrib", label: "Annual employer contributions", type: "number" },
        ],
        buildPayload: (v) => ({
          label: v.label,
          fund_name: v.fund_name || v.label,
          balance: Number(v.balance || 0),
          employer_contrib: Number(v.employer_contrib || 0),
        }),
      };
    case "property_mortgage":
    case "real_estate":
      return {
        table: "properties",
        title: "Add Property",
        blurb: "Add a residential or commercial property.",
        fields: [
          { key: "label", label: "Property name / address", placeholder: "e.g. Sydney home", full: true, required: true },
          { key: "kind", label: "Type", type: "select", options: [
            { value: "ppor", label: "Primary residence" },
            { value: "investment", label: "Investment" },
            { value: "other", label: "Commercial / other" },
          ]},
          { key: "value", label: "Estimated value (AUD)", type: "number", required: true },
          { key: "mortgage_balance", label: "Mortgage balance (AUD)", type: "number" },
          { key: "mortgage_rate", label: "Mortgage rate %", type: "number", placeholder: "6.10" },
        ],
        buildPayload: (v) => ({
          label: v.label,
          property_type: v.kind || "ppor",
          value: Number(v.value || 0),
          mortgage_balance: Number(v.mortgage_balance || 0),
          mortgage_rate: Number(v.mortgage_rate || 0),
        }),
      };
    case "crypto":
      return {
        table: "investments",
        title: "Add Crypto Holding",
        blurb: "Track wallets, exchange balances and on-chain assets.",
        fields: [
          { key: "name", label: "Asset name", placeholder: "Bitcoin", full: true, required: true },
          { key: "ticker", label: "Ticker", placeholder: "BTC" },
          { key: "value", label: "Current value (AUD)", type: "number", required: true },
        ],
        buildPayload: (v) => ({ name: v.name, ticker: v.ticker || null, value: Number(v.value || 0), kind: "crypto" }),
      };
    case "public":
      return {
        table: "investments",
        title: "Add Investment",
        blurb: "Stocks, ETFs and publicly traded funds.",
        fields: [
          { key: "name", label: "Holding name", placeholder: "Vanguard Australian Shares", full: true, required: true },
          { key: "ticker", label: "Ticker", placeholder: "VAS" },
          { key: "kind", label: "Type", type: "select", options: [
            { value: "etf", label: "ETF" },
            { value: "stock", label: "Stock" },
            { value: "managed_fund", label: "Managed fund" },
            { value: "other", label: "Other" },
          ]},
          { key: "value", label: "Current value (AUD)", type: "number", required: true },
        ],
        buildPayload: (v) => ({ name: v.name, ticker: v.ticker || null, value: Number(v.value || 0), kind: v.kind || "etf" }),
      };
    case "private":
      return {
        table: "other_assets",
        title: "Add Private Investment",
        blurb: "Private equity, venture, SAFEs and angel deals.",
        fields: [
          { key: "name", label: "Investment name", placeholder: "e.g. Acme Pty Ltd SAFE", full: true, required: true },
          { key: "description", label: "Description", type: "textarea", full: true },
          { key: "purchase_price", label: "Cost basis (AUD)", type: "number" },
          { key: "value", label: "Current value (AUD)", type: "number", required: true },
          { key: "purchase_date", label: "Investment date", type: "date" },
        ],
        buildPayload: (v) => ({
          kind: "private_investment",
          label: v.name,
          description: v.description || null,
          value: Number(v.value || 0),
          purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
          purchase_date: v.purchase_date || null,
        }),
      };
    case "vehicle":
      return {
        table: "other_assets",
        title: "Add Vehicle",
        blurb: "VIN / rego lookup via Transport NSW coming soon.",
        fields: [
          { key: "name", label: "Vehicle name", placeholder: "e.g. 2022 Tesla Model 3", full: true, required: true },
          { key: "description", label: "Notes", type: "textarea", placeholder: "Mileage, condition, etc.", full: true },
          { key: "purchase_price", label: "Purchase price (AUD)", type: "number" },
          { key: "value", label: "Current value (AUD)", type: "number", required: true },
          { key: "purchase_date", label: "Purchase date", type: "date" },
        ],
        buildPayload: (v) => ({
          kind: "vehicle",
          label: v.name,
          description: v.description || null,
          value: Number(v.value || 0),
          purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
          purchase_date: v.purchase_date || null,
        }),
      };
    case "metal":
      return {
        table: "other_assets",
        title: "Add Precious Metal",
        blurb: "Gold, silver, platinum and physical metals.",
        fields: [
          { key: "name", label: "Metal", type: "select", options: [
            { value: "Gold", label: "Gold" },
            { value: "Silver", label: "Silver" },
            { value: "Platinum", label: "Platinum" },
            { value: "Palladium", label: "Palladium" },
          ], required: true, full: true },
          { key: "notes", label: "Quantity & unit", placeholder: "e.g. 5 oz", full: true },
          { key: "purchase_price", label: "Total cost basis (AUD)", type: "number" },
          { key: "value", label: "Current value (AUD)", type: "number", required: true },
        ],
        buildPayload: (v) => ({
          kind: "metal",
          label: v.name,
          description: v.notes || null,
          value: Number(v.value || 0),
          purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
        }),
      };
    case "collectible":
      return {
        table: "other_assets",
        title: "Add Collectible",
        blurb: "Watches, art, trading cards and luxury items.",
        fields: [
          { key: "name", label: "Name", placeholder: "e.g. Rolex Submariner", full: true, required: true },
          { key: "description", label: "Description", type: "textarea", full: true },
          { key: "purchase_price", label: "Purchase price (AUD)", type: "number" },
          { key: "value", label: "Current value (AUD)", type: "number", required: true },
          { key: "purchase_date", label: "Purchase date", type: "date" },
        ],
        buildPayload: (v) => ({
          kind: "collectible",
          label: v.name,
          description: v.description || null,
          value: Number(v.value || 0),
          purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
          purchase_date: v.purchase_date || null,
        }),
      };
    case "other_asset":
      return {
        table: "other_assets",
        title: "Add Asset",
        blurb: "Anything else of value.",
        fields: [
          { key: "name", label: "Name", placeholder: "e.g. Firearms, Wine", full: true, required: true },
          { key: "description", label: "Description (optional)", type: "textarea", full: true },
          { key: "purchase_date", label: "Purchase date", type: "date" },
          { key: "purchase_price", label: "Purchase price", type: "number" },
          { key: "value", label: "Current value (AUD)", type: "number", required: true, full: true },
        ],
        buildPayload: (v) => ({
          kind: "other",
          label: v.name,
          description: v.description || null,
          value: Number(v.value || 0),
          purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
          purchase_date: v.purchase_date || null,
        }),
      };
    case "credit_card":
      return {
        table: "debts",
        title: "Add Credit Card",
        blurb: "Personal or business credit card balance.",
        fields: [
          { key: "label", label: "Card name", placeholder: "e.g. Amex Platinum", full: true, required: true },
          { key: "balance", label: "Current balance (AUD)", type: "number", required: true },
          { key: "rate", label: "Interest rate %", type: "number", placeholder: "21.99" },
        ],
        buildPayload: (v) => ({ label: v.label, balance: Number(v.balance || 0), interest_rate: Number(v.rate || 0), kind: "credit_card" }),
      };
    case "loan":
      return {
        table: "debts",
        title: "Add Mortgage or Loan",
        blurb: "Mortgages, personal loans, car loans and credit lines.",
        fields: [
          { key: "label", label: "Loan name", placeholder: "e.g. CommBank home loan", full: true, required: true },
          { key: "kind", label: "Type", type: "select", options: [
            { value: "mortgage", label: "Mortgage" },
            { value: "personal", label: "Personal loan" },
            { value: "car", label: "Car loan" },
            { value: "hecs", label: "HECS / HELP" },
            { value: "other", label: "Other" },
          ]},
          { key: "balance", label: "Current balance (AUD)", type: "number", required: true },
          { key: "rate", label: "Interest rate %", type: "number", placeholder: "6.10" },
        ],
        buildPayload: (v) => ({ label: v.label, balance: Number(v.balance || 0), interest_rate: Number(v.rate || 0), kind: v.kind || "other" }),
      };
    case "other_liability":
      return {
        table: "debts",
        title: "Add Other Liability",
        blurb: "Taxes owed, private debts and other obligations.",
        fields: [
          { key: "label", label: "Liability name", placeholder: "e.g. Personal Loan, Medical Bill, Tax Liability", full: true, required: true },
          { key: "balance", label: "Balance (amount owed)", type: "number", required: true, full: true },
        ],
        buildPayload: (v) => ({ label: v.label, balance: Number(v.balance || 0), interest_rate: 0, kind: "other" }),
      };
  }
}

function FormDialog({
  cat,
  row,
  onClose,
  onSaved,
}: {
  cat: Cat | null;
  row?: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const spec = useMemo(() => (cat ? specFor(cat) : null), [cat]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cat) return;
    const init: Record<string, any> = {};
    spec?.fields.forEach((f) => {
      const rowKey = fieldKeyForRow(cat, f.key);
      init[f.key] = row?.[rowKey] ?? (f.type === "select" && f.options?.[0] ? f.options[0].value : "");
    });
    setValues(init);
    setErrors({});
  }, [cat, row, spec]);

  if (!cat || !spec) return null;

  async function submit() {
    if (!spec || !cat) return;
    // Inline validation: collect every missing required field, show errors next to
    // each (plus a summary toast), and don't submit until they're all filled.
    const nextErrors: Record<string, string> = {};
    for (const f of spec.fields) {
      if (f.required && (values[f.key] === undefined || values[f.key] === null || String(values[f.key]).trim() === "")) {
        nextErrors[f.key] = `${f.label} is required`;
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error(Object.keys(nextErrors).length === 1 ? Object.values(nextErrors)[0] : "Please fill in the required fields");
      return;
    }
    setErrors({});
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      toast.error("Not signed in");
      return;
    }
    const payload = { ...spec.buildPayload(values), user_id: u.user.id };
    const query = supabase.from(spec.table) as any;
    const { error } = row?.id
      ? await query.update(payload).eq("id", row.id)
      : await query.insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${cat.title} ${row?.id ? "updated" : "added"}`);
    onSaved();
  }

  return (
    <Dialog open={!!cat} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{row?.id ? spec.title.replace(/^Add /, "Edit ") : spec.title}</DialogTitle>
          <DialogDescription>{spec.blurb}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {spec.fields.map((f) => (
            <div key={f.key} className={f.full ? "col-span-2" : "col-span-2 sm:col-span-1"}>
              <Label htmlFor={`field-${f.key}`} className="text-[12px]">
                {f.label}
                {f.required && <span className="text-[#C2701E]"> *</span>}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={`field-${f.key}`}
                  aria-required={f.required || undefined}
                  aria-invalid={!!errors[f.key] || undefined}
                  aria-describedby={errors[f.key] ? `err-${f.key}` : undefined}
                  className={`mt-1.5 ${errors[f.key] ? "border-[#C2701E]" : ""}`}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); setErrors((er) => (er[f.key] ? { ...er, [f.key]: "" } : er)); }}
                />
              ) : f.type === "select" ? (
                <Select value={values[f.key] ?? ""} onValueChange={(val) => { setValues((v) => ({ ...v, [f.key]: val })); setErrors((er) => (er[f.key] ? { ...er, [f.key]: "" } : er)); }}>
                  <SelectTrigger id={`field-${f.key}`} aria-required={f.required || undefined} aria-invalid={!!errors[f.key] || undefined} aria-describedby={errors[f.key] ? `err-${f.key}` : undefined} className={`mt-1.5 ${errors[f.key] ? "border-[#C2701E]" : ""}`}><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {f.options?.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`field-${f.key}`}
                  aria-required={f.required || undefined}
                  aria-invalid={!!errors[f.key] || undefined}
                  aria-describedby={errors[f.key] ? `err-${f.key}` : undefined}
                  className={`mt-1.5 ${errors[f.key] ? "border-[#C2701E]" : ""}`}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "any" : undefined}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); setErrors((er) => (er[f.key] ? { ...er, [f.key]: "" } : er)); }}
                />
              )}
              {errors[f.key] && <p id={`err-${f.key}`} className="text-[11px] text-[#C2701E] mt-1">{errors[f.key]}</p>}
              {f.hint && !errors[f.key] && <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-foreground text-background hover:bg-foreground/90">
            {saving ? "Saving…" : row?.id ? "Save changes" : `Add ${cat.side === "asset" ? "Asset" : "Liability"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fieldKeyForRow(cat: Cat, fieldKey: string) {
  if (cat.key === "real_estate" && fieldKey === "kind") return "property_type";
  if ((cat.key === "credit_card" || cat.key === "loan") && fieldKey === "rate") return "interest_rate";
  if (["private", "vehicle", "metal", "collectible", "other_asset"].includes(cat.key) && fieldKey === "name") return "label";
  if (["private", "vehicle", "collectible", "other_asset"].includes(cat.key) && fieldKey === "description") return "description";
  if (cat.key === "metal" && fieldKey === "notes") return "description";
  return fieldKey;
}
