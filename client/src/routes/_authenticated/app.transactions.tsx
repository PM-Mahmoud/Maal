import { createFileRoute } from "@tanstack/react-router";

import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, Repeat } from "lucide-react";
import { listTransactions, seedMockTransactions, clearTransactions, addTransaction } from "@/lib/transactions.functions";
import { getCategoryGroups, getRecurringTransactions, setTransactionCategory, type CategoryGroup, type RecurringTransaction } from "@/lib/transactions-depth.functions";
import { RulesModal } from "@/components/maal/transactions/RulesModal";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import { formatAUD } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/app/transactions")({ component: TransactionsPage });

// Logos resolve via InstitutionLogo (registry in lib/institutions.ts, monogram fallback).
const AU_BANKS = ["CommBank", "Westpac", "ANZ", "NAB", "ING", "Macquarie"];

const CATS = ["groceries","dining","transport","housing","utilities","health","income","investing","savings","entertainment","other"];

// --- CSV import helpers ----------------------------------------------------

// Minimal RFC-4180-style CSV parser: quoted fields, "" escaped quotes, embedded
// commas and newlines inside quotes, CRLF or LF row endings. No dependencies.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // strip a UTF-8 BOM
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c; // commas and newlines inside quotes are literal
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++; // CRLF
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // Flush a trailing field/row when the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Strict date parsing for CSV cells: accepts YYYY-MM-DD or AU-style DD/MM/YYYY
// and rejects impossible dates (e.g. 31 Feb) instead of letting Date guess.
// Returns a normalised YYYY-MM-DD string, or null when the cell is unreadable.
function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  let y = 0, m = 0, d = 0;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else {
    match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Retry-safety for CSV imports without a bulk endpoint: fingerprints of rows
// that imported successfully are remembered in this browser, so re-uploading
// the same file after a partial failure skips them instead of duplicating.
// (Trade-off: two genuinely identical transactions on the same day import once.)
const IMPORTED_KEY = "maal_csv_imported_v1";
const MAX_IMPORTED_KEYS = 5000;

function rowFingerprint(r: { occurred_on: string; description: string; amount: number }): string {
  return `${r.occurred_on}|${r.description.trim().toLowerCase()}|${r.amount.toFixed(2)}`;
}
function loadImportedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch { return new Set(); }
}
function saveImportedKeys(keys: Set<string>): void {
  try { localStorage.setItem(IMPORTED_KEY, JSON.stringify(Array.from(keys).slice(-MAX_IMPORTED_KEYS))); }
  catch { /* storage blocked or full — non-fatal */ }
}

function TransactionsPage() {
  const list = listTransactions;
  const seed = seedMockTransactions;
  const clear = clearTransactions;
  const addTx = addTransaction;

  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [form, setForm] = useState({ occurred_on: new Date().toISOString().slice(0,10), description: "", category: "other", amount: "" });
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [manualErr, setManualErr] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "subs">("all");
  const [subs, setSubs] = useState<RecurringTransaction[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [showRules, setShowRules] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { getCategoryGroups().then(setCategoryGroups); }, []);

  // Reset subs on any transactions refresh so the Subscriptions tab re-detects
  // after a manual add / CSV import instead of showing stale merchants.
  // A list failure is surfaced explicitly rather than masquerading as "no rows".
  async function refresh() {
    try {
      setRows((await list()) as any);
      setSubs([]);
      setPageErr(null);
    } catch (e: any) {
      setPageErr(e?.message ?? "Couldn't load transactions.");
    }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (view === "subs" && subs.length === 0) getRecurringTransactions().then(setSubs); }, [view, subs.length]);

  const monthlySubTotal = useMemo(() => {
    const per = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, yearly: 1 / 12 } as Record<string, number>;
    return subs.filter((s) => s.kind !== "income").reduce((a, s) => a + s.averageAmount * (per[s.cadence] ?? 1), 0);
  }, [subs]);

  const filteredBanks = useMemo(
    () => AU_BANKS.filter((b) => b.toLowerCase().includes(search.trim().toLowerCase())),
    [search]
  );

  const totalIn = rows.filter((r) => Number(r.amount) > 0).reduce((a, r) => a + Number(r.amount), 0);
  const totalOut = rows.filter((r) => Number(r.amount) < 0).reduce((a, r) => a + Math.abs(Number(r.amount)), 0);

  function connectStub(name: string) {
    setImportMsg(`${name} connect is coming soon — we'll wire this via Basiq. Use Import Manually or Manual entry for now.`);
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    setBusy("manual"); setManualErr(null);
    try {
      await addTx({ data: { ...form, amount: Number(form.amount) } } as any);
      setForm({ occurred_on: new Date().toISOString().slice(0,10), description: "", category: "other", amount: "" });
      setManualOpen(false);
      await refresh();
    } catch (err: any) {
      // Keep the modal open so the entry isn't lost and the failure is visible.
      setManualErr(err?.message ?? "Couldn't save the transaction — please try again.");
    } finally { setBusy(null); }
  }

  // Parse a CSV amount cell, preserving accounting negatives like "(12.34)" and
  // "-12.34"/"12.34 CR". Returns a finite number or null.
  function parseAmount(raw: string): number | null {
    const s = String(raw).trim();
    const negative = /^\(.*\)$/.test(s) || /\bcr\b/i.test(s) || /^-/.test(s);
    const n = Number(s.replace(/[()]/g, "").replace(/[^0-9.]/g, ""));
    if (!isFinite(n)) return null;
    return negative ? -Math.abs(n) : n;
  }

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy("import"); setImportMsg(null); setImportErr(null);
    try {
      // PDF statement parsing isn't supported yet — don't feed a PDF through the
      // CSV parser (it would produce garbage rows).
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        setImportErr("PDF statements aren't supported yet — export a CSV (Date, Description, Amount) and upload that.");
        return;
      }
      const text = await file.text();
      const rows = parseCsv(text).filter((r) => r.some((c) => c.trim().length > 0));
      const headerCells = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
      const hasHeader = headerCells.some((c) => c.includes("date")) && headerCells.some((c) => c.includes("amount"));
      const body = hasHeader ? rows.slice(1) : rows;

      // Parse + validate EVERY row first; only write if the whole file is clean,
      // so a malformed row can't leave a partial import behind. Errors name the
      // exact row and field that couldn't be read.
      const parsed: { occurred_on: string; description: string; amount: number }[] = [];
      for (let i = 0; i < body.length; i++) {
        const cells = body[i];
        if (cells.length < 3) continue; // stray notes/summary lines in bank exports
        const rowNo = i + (hasHeader ? 2 : 1); // human-facing row number in the file
        const [rawDate, rawDesc, rawAmt] = cells.map((c) => c.trim());
        const d = parseDateCell(rawDate);
        if (!d) {
          setImportErr(`Row ${rowNo}: couldn't read the date ("${rawDate.slice(0, 24)}") — use YYYY-MM-DD or DD/MM/YYYY. No transactions were imported.`);
          return;
        }
        if (!rawDesc) {
          setImportErr(`Row ${rowNo}: missing a description. No transactions were imported — please check the file.`);
          return;
        }
        const amount = parseAmount(rawAmt);
        if (amount === null) {
          setImportErr(`Row ${rowNo}: couldn't read the amount ("${rawAmt.slice(0, 24)}"). No transactions were imported — please check the file.`);
          return;
        }
        parsed.push({ occurred_on: d, description: rawDesc.slice(0, 160), amount });
      }
      if (!parsed.length) { setImportErr("No valid rows found. Expected columns: Date, Description, Amount."); return; }

      // Idempotency: rows whose fingerprint was already imported (remembered in
      // this browser) are skipped, so re-uploading the same file after a partial
      // failure retries only the rows that didn't make it — never duplicates.
      const seen = loadImportedKeys();
      let inserted = 0, skipped = 0;
      const failures: string[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];
        const fp = rowFingerprint(row);
        if (seen.has(fp)) { skipped++; continue; }
        try {
          await addTx({ data: { ...row, category: "other" } } as any);
          seen.add(fp); inserted++;
        } catch (err: any) {
          failures.push(`row ${i + 1} (${row.description.slice(0, 24)}): ${err?.message ?? "save failed"}`);
        }
      }
      saveImportedKeys(seen);
      await refresh();

      const total = parsed.length;
      if (failures.length) {
        setImportErr(
          `Imported ${inserted} of ${total} row${total === 1 ? "" : "s"}${skipped ? ` (${skipped} already imported — skipped)` : ""}. ` +
          `Failed: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? ` (+${failures.length - 3} more)` : ""}. ` +
          `Re-upload the same file to retry — already-imported rows are skipped.`
        );
      } else if (inserted === 0 && skipped > 0) {
        setImportMsg(`All ${skipped} row${skipped === 1 ? "" : "s"} from ${file.name} ${skipped === 1 ? "was" : "were"} already imported — nothing new to add.`);
      } else {
        setImportMsg(`Imported ${inserted} row${inserted === 1 ? "" : "s"} from ${file.name}${skipped ? ` (${skipped} already imported — skipped)` : ""}.`);
      }
    } catch (err: any) {
      setImportErr(err?.message ?? "Import failed");
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] tracking-display font-bold">Transactions</h1>
        <div className="flex gap-2">
          <button onClick={async () => { setBusy("seed"); await seed(); await refresh(); setBusy(null); }} disabled={busy === "seed"}
            className="px-3 py-1.5 border border-border rounded-[8px] text-[11px] font-semibold disabled:opacity-60">
            {busy === "seed" ? "Loading…" : "Load demo data"}
          </button>
          <button onClick={async () => { await clear(); refresh(); }}
            className="px-3 py-1.5 border border-border rounded-[8px] text-[11px] font-semibold">Clear</button>
        </div>
      </div>

      {pageErr && (
        <p className="mb-6 px-4 py-3 rounded-[10px] border border-[var(--gold)]/30 bg-[var(--gold)]/10 text-[12px]">{pageErr}</p>
      )}

      {/* How to use banner */}
      <div className="bg-[var(--surface)] border border-border rounded-[12px] p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--secondary)] flex items-center justify-center text-[12px] font-bold">S</div>
            <p className="text-[13px] font-semibold">How to use transactions</p>
          </div>
          <button onClick={() => setHowOpen((v) => !v)} className="text-muted-foreground text-[16px] leading-none w-6 h-6">{howOpen ? "−" : "+"}</button>
        </div>
        {howOpen && (
          <p className="text-[12px] text-muted-foreground mt-3 pt-3 border-t border-dashed border-border">
            Connect your bank account and all your transactions and subscriptions will sync in near real-time. Takes a few minutes.
            Alternatively, if you'd prefer to upload your statements manually, you can upload them on the right.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Connect an account */}
        <section className="bg-[var(--surface)] border border-border rounded-[12px] p-6">
          <h2 className="text-[14px] font-semibold mb-4">Connect an account</h2>

          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search from 10,000+ AU institutions…"
              className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-[8px] text-[13px] placeholder:text-muted-foreground" />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {filteredBanks.map((b) => (
              <button key={b} onClick={() => connectStub(b)}
                className="flex flex-col items-center gap-2 p-4 bg-background border border-border rounded-[10px] hover:border-foreground transition-colors">
                <InstitutionLogo name={b} size={40} />
                <p className="text-[11px] font-medium">{b}</p>
              </button>
            ))}
            {filteredBanks.length === 0 && (
              <p className="col-span-3 text-center text-[12px] text-muted-foreground py-4">No matches. Basiq integration covers 10,000+ AU institutions — coming soon.</p>
            )}
          </div>

          <p className="text-center text-[11px] text-muted-foreground my-3">or</p>

          <button onClick={() => { setManualErr(null); setManualOpen(true); }}
            className="w-full p-4 bg-background border border-border rounded-[10px] text-center hover:border-foreground transition-colors">
            <p className="text-[13px] font-semibold">Manual</p>
            <p className="text-[11px] text-muted-foreground">Add a single transaction by hand</p>
          </button>

          <p className="text-center text-[11px] text-muted-foreground mt-4">Having issues? <a href="/contact" className="text-[var(--mint)] underline">Contact support</a>.</p>

          <div className="mt-5 pt-4 border-t border-dashed border-border flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-muted-foreground"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <div className="text-[11px] text-muted-foreground">
              <p><span className="font-semibold text-foreground">Your data is secure</span> (<a href="/security" className="text-[var(--mint)] underline">more on security</a>)</p>
              <p className="mt-1">Maal cannot make transactions on your behalf, or make changes to your banking accounts. You can revoke access at any time. We do not store banking credentials on our servers. Your data is never sold.</p>
            </div>
          </div>
        </section>

        {/* Import Manually */}
        <aside className="bg-[var(--surface)] border border-border rounded-[12px] p-6">
          <h2 className="text-[14px] font-semibold mb-4">Import Manually</h2>

          <label className="block border-2 border-dashed border-border rounded-[10px] py-12 text-center cursor-pointer hover:border-foreground transition-colors">
            <input ref={fileRef} type="file" accept=".csv,.pdf" className="hidden" onChange={onCsv} />
            <svg className="mx-auto mb-2 text-muted-foreground" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0-12l-4 4m4-4l4 4M5 21h14"/></svg>
            <p className="text-[12px] font-semibold tracking-[0.12em] uppercase">{busy === "import" ? "Importing…" : "Upload CSV or PDF"}</p>
          </label>

          <div className="mt-4 text-[11px] text-muted-foreground space-y-1">
            <p className="flex items-center gap-1 text-foreground font-semibold"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> Supported formats:</p>
            <p><span className="font-semibold text-foreground">CSV:</span> Date, Description, Amount</p>
            <p><span className="font-semibold text-foreground">PDF:</span> Bank statements (auto-parsed, coming soon)</p>
          </div>

          {importMsg && <p className="text-[11px] text-[var(--mint)] mt-3">{importMsg}</p>}
          {importErr && <p className="text-[11px] text-[var(--gold)] mt-3">{importErr}</p>}
        </aside>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} onApplied={refresh} />}

      {/* Existing transactions table */}
      {rows.length > 0 && (
        <div className="mt-8">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Money in" value={formatAUD(totalIn)} accent="mint" />
            <Stat label="Money out" value={formatAUD(totalOut)} />
            <Stat label="Net" value={formatAUD(totalIn - totalOut)} accent={totalIn - totalOut >= 0 ? "mint" : "gold"} />
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="inline-flex items-center gap-1 p-1 bg-[var(--secondary)] rounded-[10px]">
              <button onClick={() => setView("all")} className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium ${view === "all" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>All transactions</button>
              <button onClick={() => setView("subs")} className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1.5 ${view === "subs" ? "bg-background shadow-sm" : "text-muted-foreground"}`}><Repeat className="size-3.5" /> Recurring</button>
            </div>
            <button onClick={() => setShowRules(true)} className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40">
              <SlidersHorizontal className="size-3.5" /> Rules
            </button>
          </div>

          {view === "all" ? (
            <div className="border border-border rounded-[12px] bg-[var(--surface)] overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-[var(--secondary)] text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Description</th><th className="text-left px-4 py-2">Category</th><th className="text-right px-4 py-2">Amount</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 tabular-nums">{r.post_date ?? r.occurred_on}</td>
                      <td className="px-4 py-2">{r.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        <select value={r.category_source === "manual" && r.category
                          ? JSON.stringify([r.category_group, r.category]) : ""}
                          aria-label={`Category for ${r.description}`}
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            const [group, category] = JSON.parse(e.target.value);
                            if (await setTransactionCategory(r.id, group, category)) refresh();
                          }}
                          className="max-w-36 bg-transparent text-[12px]">
                          <option value="">{r.category_group ?? "Choose category…"}</option>
                          {categoryGroups.flatMap((group) => group.categories.map((category) =>
                            <option key={`${group.group}:${category}`} value={JSON.stringify([group.group, category])}>{group.group} · {category}</option>
                          ))}
                        </select>
                        {r.category_source === "auto" && <span className="ml-1.5 text-[10px] text-muted-foreground/60">auto</span>}
                        {r.category_source === "learned" && <span className="ml-1.5 text-[10px] text-muted-foreground/60">suggested {Math.round(Number(r.category_confidence) * 100)}%</span>}
                        {r.relationship_type && <span className="ml-1.5 text-[10px] text-muted-foreground/60">{String(r.relationship_type).replaceAll("_", " ")}</span>}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${Number(r.amount) >= 0 ? "text-[var(--mint)]" : ""}`}>{formatAUD(Number(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              {subs.length > 0 && (
                <p className="text-[12px] text-muted-foreground mb-3">
                  {subs.length} recurring payment{subs.length === 1 ? "" : "s"} · ~<span className="font-semibold text-foreground">{formatAUD(monthlySubTotal)}</span>/month
                </p>
              )}
              <div className="border border-border rounded-[12px] bg-[var(--surface)] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-[var(--secondary)] text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr><th className="text-left px-4 py-2">Merchant</th><th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">Cadence</th><th className="text-left px-4 py-2">Next</th><th className="text-right px-4 py-2">Average</th></tr>
                  </thead>
                  <tbody>
                    {subs.map((s, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-2">{s.merchant}</td>
                        <td className="px-4 py-2 capitalize text-muted-foreground">{s.kind}<span className="block text-[10px]">{Math.round(s.confidence * 100)}% · {s.occurrences} occurrences</span></td>
                        <td className="px-4 py-2 capitalize text-muted-foreground">{s.cadence}</td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{s.nextEstimate ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatAUD(s.averageAmount)}<span className="block text-[10px] text-muted-foreground">{formatAUD(s.minAmount)}–{formatAUD(s.maxAmount)}</span></td>
                      </tr>
                    ))}
                    {subs.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-[12px] text-muted-foreground">No recurring activity detected yet. Connect an account or import transactions to identify income, bills, and subscriptions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center mt-8">
        Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.
      </p>

      {/* Manual entry dialog */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setManualOpen(false)}>
          <form onSubmit={submitManual} onClick={(e) => e.stopPropagation()}
            className="bg-background border border-border rounded-[12px] p-6 w-full max-w-md space-y-3">
            <h3 className="text-[16px] font-bold">Add transaction</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" required value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] bg-[var(--surface)] text-[13px]" /></Field>
              <Field label="Amount (negative = spend)"><input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] bg-[var(--surface)] text-[13px]" /></Field>
            </div>
            <Field label="Description"><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] bg-[var(--surface)] text-[13px]" /></Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] bg-[var(--surface)] text-[13px] capitalize">
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            {manualErr && <p className="text-[12px] text-[var(--gold)]">{manualErr}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setManualOpen(false)} className="px-4 py-2 border border-border rounded-[8px] text-[12px] font-semibold">Cancel</button>
              <button type="submit" disabled={busy === "manual"} className="px-4 py-2 bg-foreground text-background rounded-[8px] text-[12px] font-semibold disabled:opacity-60">{busy === "manual" ? "Saving…" : "Add"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "mint" | "gold" }) {
  const color = accent === "mint" ? "text-[var(--mint)]" : accent === "gold" ? "text-[var(--gold)]" : "";
  return (
    <div className="p-5 border border-border rounded-[12px] bg-[var(--surface)]">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[22px] font-bold tracking-display ${color}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
