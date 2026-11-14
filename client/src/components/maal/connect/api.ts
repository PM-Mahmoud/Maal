// Data layer for ConnectAccountsFlow. Talks to the existing Express routes:
//   GET  /basiq/institutions        → picker catalogue (static AU list without a key)
//   GET  /api/v1/basiq/status       → { live, connected }
//   GET  /basiq/connect?institution → Basiq hosted consent (opened in a new tab)
//   POST /api/v1/basiq/sync         → queues an import run
//   GET  /api/v1/import-runs/:id    → poll the run
//   GET  /api/v1/linked_accounts    → accounts after import
//   POST /api/v1/<table>            → manual accounts (user-scoped server-side)

export type InstitutionCategory = "bank" | "super" | "investment";

export interface InstitutionOption {
  /** Basiq institution id (e.g. "AU00000"); null for the static demo list. */
  id: string | null;
  slug: string | null;
  name: string;
  shortName: string;
  category: InstitutionCategory;
  logo: string | null;
  url: string | null;
}

export interface InstitutionCatalogue {
  live: boolean;
  source: "basiq" | "static";
  popular: InstitutionOption[];
  institutions: InstitutionOption[];
}

export interface LinkedAccountSummary {
  id: string | number;
  institution_name: string;
  institution_type?: string | null;
}

// Used only if /basiq/institutions can't be reached at all.
const FALLBACK: InstitutionOption[] = [
  ["commbank", "CommBank", "bank"], ["westpac", "Westpac", "bank"], ["nab", "NAB", "bank"], ["anz", "ANZ", "bank"],
  ["macquarie", "Macquarie", "bank"], ["ing", "ING", "bank"], ["up", "Up", "bank"], ["ubank", "ubank", "bank"],
  ["bendigo", "Bendigo Bank", "bank"], ["stgeorge", "St.George", "bank"], ["suncorp", "Suncorp", "bank"], ["bankwest", "Bankwest", "bank"],
  ["australiansuper", "AustralianSuper", "super"], ["hostplus", "Hostplus", "super"], ["commsec", "CommSec", "investment"],
].map(([slug, name, category]) => ({
  id: null, slug, name, shortName: name, category: category as InstitutionCategory,
  logo: ["bankwest"].includes(slug) ? null : `/images/banks/${slug}.png`, url: null,
}));

export async function fetchCatalogue(): Promise<InstitutionCatalogue> {
  try {
    const r = await fetch("/basiq/institutions", { credentials: "include", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as InstitutionCatalogue;
    if (!Array.isArray(j.institutions)) throw new Error("bad shape");
    return j;
  } catch {
    return { live: false, source: "static", popular: FALLBACK.slice(0, 12), institutions: FALLBACK };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Same ranking as services/basiq-institutions.js searchInstitutions(). */
export function searchCatalogue(list: InstitutionOption[], query: string, category?: InstitutionCategory | null, limit = 60) {
  const q = norm(query);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!q && !category) return [];
  const scored: { inst: InstitutionOption; score: number }[] = [];
  for (const inst of list) {
    if (category && inst.category !== category) continue;
    const name = norm(inst.name);
    const short = norm(inst.shortName);
    let score: number;
    if (!q) score = 4;
    else if (name === q || short === q) score = 0;
    else if (name.startsWith(q) || short.startsWith(q)) score = 1;
    else if (words.every((w) => inst.name.toLowerCase().split(/[\s\-.&()]+/).some((p) => p.startsWith(w.replace(/[^a-z0-9]/g, ""))))) score = 2;
    else if (name.includes(q) || short.includes(q)) score = 3;
    else continue;
    scored.push({ inst, score });
  }
  scored.sort((a, b) => a.score - b.score || a.inst.name.localeCompare(b.inst.name, "en-AU"));
  return scored.slice(0, limit).map((s) => s.inst);
}

export function consentUrl(inst: InstitutionOption | null) {
  return inst?.id ? `/basiq/connect?institution=${encodeURIComponent(inst.id)}` : "/basiq/connect";
}

/**
 * Queue a Basiq import and wait for it (up to ~90s). Resolves with the user's
 * linked accounts. Throws a user-facing message on failure.
 */
export async function syncAndWait(signal?: AbortSignal): Promise<{ accounts: LinkedAccountSummary[]; count: number }> {
  const r = await fetch("/api/v1/basiq/sync", {
    method: "POST",
    credentials: "include",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    signal,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.import_run_id) throw new Error(j.error || "We couldn’t start the import. Please try again.");
  let count = 0;
  for (let i = 0; i < 90; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    if (signal?.aborted) throw new Error("Cancelled");
    const s = await fetch(`/api/v1/import-runs/${encodeURIComponent(j.import_run_id)}`, { credentials: "include", signal });
    if (!s.ok) continue;
    const { import_run: run } = await s.json();
    if (run?.status === "succeeded") { count = Number(run.summary?.accounts ?? 0); break; }
    if (run?.status === "dead") throw new Error("Your bank didn’t respond. Try again in a moment.");
  }
  const la = await fetch("/api/v1/linked_accounts", { credentials: "include", signal })
    .then((x) => (x.ok ? x.json() : []))
    .catch(() => []);
  const accounts: LinkedAccountSummary[] = Array.isArray(la) ? la : la?.data ?? [];
  return { accounts, count };
}

// ---------- Manual accounts ----------

export type ManualKind = "bank" | "cash" | "super" | "property" | "vehicle" | "valuables" | "debt" | "other";
export type BankAccountType = "transaction" | "savings" | "credit_card";

export interface ManualInput {
  kind: ManualKind;
  accountType: BankAccountType;
  name: string;
  amount: string;
}

/** Whole dollars (the asset tables store BIGINT dollars). Strips $ and commas. */
export function parseDollars(raw: string): number {
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n));
}

export function manualPayload(input: ManualInput): { table: string; body: Record<string, unknown> } {
  const label = input.name.trim().slice(0, 120);
  const amount = parseDollars(input.amount);
  switch (input.kind) {
    case "bank":
      return input.accountType === "credit_card"
        ? { table: "debts", body: { label: label || "Credit card", kind: "credit_card", balance: amount } }
        : { table: "cash_accounts", body: { label: label || "Bank account", account_type: input.accountType, balance: amount, source: "manual" } };
    case "cash":
      return { table: "cash_accounts", body: { label: label || "Cash", account_type: "cash", balance: amount, source: "manual" } };
    case "super":
      return { table: "super_accounts", body: { label: label || "Super fund", fund_name: label || null, balance: amount } };
    case "property":
      return { table: "properties", body: { label: label || "Property", property_type: "ppor", value: amount } };
    case "debt":
      return { table: "debts", body: { label: label || "Debt", kind: "other", balance: amount } };
    case "vehicle":
    case "valuables":
    case "other":
      return { table: "other_assets", body: { label: label || "Asset", kind: input.kind === "valuables" ? "collectible" : input.kind, value: amount } };
  }
}

export async function saveManual(input: ManualInput) {
  const { table, body } = manualPayload(input);
  const r = await fetch(`/api/v1/${table}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("We couldn’t save that. Please try again.");
  return r.json().catch(() => ({}));
}
