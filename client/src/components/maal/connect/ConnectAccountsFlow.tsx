import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowUpRight, Banknote, Building2, Car, ChevronDown, ChevronLeft, ChevronRight, FileUp,
  Gem, Home, Landmark, Plus, RefreshCw, Search, UserPlus, X, XCircle,
} from "lucide-react";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import { MaalMark } from "@/components/maal/MaalMark";
import { Disclaimer } from "@/components/maal/Disclaimer";
import {
  consentUrl, fetchCatalogue, manualPayload, parseDollars, saveManual, searchCatalogue, syncAndWait,
  type BankAccountType, type InstitutionCatalogue, type InstitutionCategory, type InstitutionOption,
  type LinkedAccountSummary, type ManualKind,
} from "./api";
import "../../../v2-landing.css"; // Lora + Inter font import (styles there are scoped to .v2)
import "./connect-accounts.css";

/* ------------------------------------------------------------------
   ConnectAccountsFlow — one flow for both entry points:
     mode="onboarding"  /welcome: dark "Connect your accounts" intro →
                        institution dialog → owner → connecting → "Nice work"
     mode="app"         in-app "Add account": the same dialogs as a modal
                        over the current page, plus manual accounts.
   Live Basiq when BASIQ_API_KEY is set (consent opens in a new tab because
   Basiq's hosted consent screen doesn't redirect back); otherwise a demo
   walk-through that never pretends real data was imported.
   ------------------------------------------------------------------ */

/** Maps to canonical-wealth ownership_interests.owner_type ('self' | 'joint'). */
export type OwnerType = "self" | "joint";

export interface ConnectResult {
  /** basiq = real CDR import, demo = walkthrough only, manual = typed-in account. */
  source: "basiq" | "demo" | "manual";
  linked: LinkedAccountSummary[];
  /** Accounts the import run reported (basiq), else linked.length. */
  count: number;
  institution: InstitutionOption | null;
  owner: OwnerType;
}

export interface ConnectAccountsFlowProps {
  mode: "onboarding" | "app";
  /** Continue after a successful connection (or a manual save in app mode). */
  onDone: (result: ConnectResult) => void;
  /** Onboarding: the top-left Back button on the intro screen. */
  onBack?: () => void;
  /** Onboarding: the top-right Skip button. */
  onSkip?: () => void;
  /** App mode: the dialog was closed without finishing. */
  onClose?: () => void;
  /** Shown in "Nice work, {firstName}". Fetched from /api/me when omitted. */
  firstName?: string;
  /** Onboarding: render the Back / Maal / Skip bar and footer (default true).
   *  Pass false when the host page already renders its own chrome. */
  chrome?: boolean;
  /** App mode: open straight on the manual-account picker. */
  initialStep?: "choose" | "manual";
}

type Step = "intro" | "choose" | "owner" | "connecting" | "connected" | "manual" | "manual-form";
type Phase = "waiting" | "importing" | "error";

const OWNER_KEY = "maal_connect_owner";
const CATEGORY_COPY: Record<InstitutionCategory, string> = {
  bank: "Banks and credit cards",
  super: "Super funds",
  investment: "Brokers and investing",
};

const MANUAL_TILES: { kind: ManualKind; label: string; icon: ReactNode }[] = [
  { kind: "bank", label: "Bank account", icon: <Landmark className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "cash", label: "Cash", icon: <Banknote className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "super", label: "Super", icon: <Building2 className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "property", label: "Property", icon: <Home className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "vehicle", label: "Vehicles", icon: <Car className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "valuables", label: "Valuables", icon: <Gem className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "debt", label: "Unpaid debt", icon: <ArrowDownRight className="size-[18px]" strokeWidth={1.5} /> },
  { kind: "other", label: "Other", icon: <ArrowUpRight className="size-[18px]" strokeWidth={1.5} /> },
];

const MANUAL_HEADINGS: Record<ManualKind, { label: string; name: string; amount: string; placeholder: string }> = {
  bank: { label: "Bank accounts", name: "Account name", amount: "Current balance", placeholder: "e.g. Everyday account" },
  cash: { label: "Cash", name: "Name", amount: "Amount", placeholder: "e.g. Cash at home" },
  super: { label: "Super", name: "Fund name", amount: "Current balance", placeholder: "e.g. AustralianSuper" },
  property: { label: "Property", name: "Property name", amount: "Estimated value", placeholder: "e.g. Home" },
  vehicle: { label: "Vehicles", name: "Vehicle", amount: "Estimated value", placeholder: "e.g. Family car" },
  valuables: { label: "Valuables", name: "Item", amount: "Estimated value", placeholder: "e.g. Jewellery" },
  debt: { label: "Unpaid debt", name: "Debt name", amount: "Amount owing", placeholder: "e.g. Tax bill" },
  other: { label: "Other assets", name: "Name", amount: "Estimated value", placeholder: "e.g. Shares in a family business" },
};

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
const hostOf = (url: string | null) => (url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "");
const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "Me";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function readOwnerPref(): OwnerType | null {
  try {
    const v = localStorage.getItem(OWNER_KEY);
    return v === "self" || v === "joint" ? v : null;
  } catch { return null; }
}

/* ---------------- Small building blocks ---------------- */

function Logo({ inst, size }: { inst: Pick<InstitutionOption, "name" | "shortName" | "logo">; size: number }) {
  return (
    <span className="cx-logo-circle" style={{ width: size, height: size }}>
      <InstitutionLogo name={inst.shortName || inst.name} logoUrl={inst.logo} size={size} />
    </span>
  );
}

function Dialog({
  label, onBack, onClose, children, short, centred, labelledBy,
}: {
  label: string; onBack?: () => void; onClose: () => void; children: ReactNode; short?: boolean; centred?: boolean; labelledBy?: string;
}) {
  // Escape closes; background scroll is locked while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="cx-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`cx-dialog${short ? " is-short" : ""}${centred ? " is-centred" : ""}`} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
        {label ? (
          <div className="cx-dhead">
            {onBack && (
              <button type="button" className="cx-icon-btn" onClick={onBack} aria-label="Back">
                <ChevronLeft className="size-5" strokeWidth={1.5} />
              </button>
            )}
            <span className="cx-dlabel" style={onBack ? undefined : { paddingLeft: 6 }}>{label}</span>
            <button type="button" className="cx-icon-btn cx-close" onClick={onClose} aria-label="Close">
              <X className="size-5" strokeWidth={1.5} />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function ConnectedToast({ title, sub, onDismiss }: { title: string; sub: string; onDismiss: () => void }) {
  const MS = 6000;
  useEffect(() => { const t = setTimeout(onDismiss, MS); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div className="cx cx-toast" role="status" aria-live="polite">
      <RefreshCw className="cx-toast-icon size-5" strokeWidth={1.6} />
      <div>
        <p className="cx-toast-title">{title}</p>
        <p className="cx-toast-sub">{sub}</p>
      </div>
      <button type="button" className="cx-icon-btn" onClick={onDismiss} aria-label="Dismiss"><X className="size-4" /></button>
      <div className="cx-toast-track"><div className="cx-toast-bar" style={{ animationDuration: `${MS}ms` }} /></div>
    </div>
  );
}

/* ---------------- The flow ---------------- */

export function ConnectAccountsFlow({
  mode, onDone, onBack, onSkip, onClose, firstName: firstNameProp, chrome = true, initialStep,
}: ConnectAccountsFlowProps) {
  const isApp = mode === "app";
  const [step, setStep] = useState<Step>(isApp ? (initialStep ?? "choose") : "intro");
  const [catalogue, setCatalogue] = useState<InstitutionCatalogue | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<InstitutionCategory | null>(null);
  const [picked, setPicked] = useState<InstitutionOption | null>(null);
  const [owner, setOwner] = useState<OwnerType>("self");
  const [dontAsk, setDontAsk] = useState(false);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedAccountSummary[]>([]);
  const [lastResult, setLastResult] = useState<ConnectResult | null>(null);
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [firstName, setFirstName] = useState(firstNameProp ?? "");
  const [manualKind, setManualKind] = useState<ManualKind>("bank");
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { fetchCatalogue().then(setCatalogue); }, []);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (firstNameProp) { setFirstName(firstNameProp); return; }
    fetch("/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u?.name) setFirstName(String(u.name).split(" ")[0]); })
      .catch(() => {});
  }, [firstNameProp]);

  const live = !!catalogue?.live;
  const list = catalogue?.institutions ?? [];
  const popular = catalogue?.popular ?? [];
  const searching = query.trim().length > 0 || category !== null;
  const results = useMemo(() => searchCatalogue(list, query, category), [list, query, category]);
  const orderedForIntro = useMemo(() => {
    const keyOf = (i: InstitutionOption) => i.id ?? i.slug ?? i.name;
    const seen = new Set(popular.map(keyOf));
    return [...popular, ...list.filter((i) => !seen.has(keyOf(i)) && (i.logo || i.slug))];
  }, [popular, list]);
  const byCategory = useCallback((c: InstitutionCategory) => list.filter((i) => i.category === c).slice(0, 4), [list]);

  const resetPicker = () => { setQuery(""); setCategory(null); };
  const closeDialog = useCallback(() => {
    abortRef.current?.abort();
    resetPicker();
    if (isApp) {
      if (lastResult) onDone(lastResult);
      else onClose?.();
    } else {
      setStep(linked.length ? "connected" : "intro");
    }
  }, [isApp, lastResult, linked.length, onClose, onDone]);

  /* --- connecting --- */

  const finishWith = (result: ConnectResult, toastCopy: { title: string; sub: string }) => {
    setLinked((cur) => {
      const ids = new Set(cur.map((a) => String(a.id)));
      return [...cur, ...result.linked.filter((a) => !ids.has(String(a.id)))];
    });
    setLastResult(result);
    setToast(toastCopy);
    setStep("connected");
  };

  const runImport = async (inst: InstitutionOption, who: OwnerType) => {
    setPhase("importing");
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      if (!live) {
        // Demo: walk the screens without touching any bank.
        await new Promise((r) => setTimeout(r, 2400));
        if (ctrl.signal.aborted) return;
        finishWith(
          { source: "demo", linked: [{ id: `demo-${inst.slug ?? inst.name}`, institution_name: inst.name, institution_type: "Demo" }], count: 1, institution: inst, owner: who },
          { title: "Demo account added", sub: "Bank connections switch on soon. No real bank data was used." },
        );
        return;
      }
      const { accounts, count } = await syncAndWait(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!accounts.length && !count) {
        setPhase("error");
        setError(`We didn’t find any ${inst.shortName} accounts yet. Finish connecting in the other tab, then try again.`);
        return;
      }
      const key = norm(inst.shortName);
      const mine = accounts.filter((a) => { const n = norm(a.institution_name || ""); return key && (n.includes(key) || key.includes(n)); });
      finishWith(
        { source: "basiq", linked: mine.length ? mine : accounts, count: count || accounts.length, institution: inst, owner: who },
        { title: "Your account is now connected", sub: "All data will refresh automatically within the next few minutes." },
      );
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setPhase("error");
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  };

  // Called from a click handler so the consent tab isn't popup-blocked.
  const startConnect = (inst: InstitutionOption, who: OwnerType) => {
    setPicked(inst);
    setOwner(who);
    setError(null);
    setStep("connecting");
    if (!live) { void runImport(inst, who); return; }
    const w = window.open(consentUrl(inst), "_blank");
    if (w) { try { w.opener = null; } catch { /* cross-origin */ } }
    setPhase("waiting");
    if (!w) setError("Your browser blocked the new tab. Use the button below to open it.");
  };

  const pickInstitution = (inst: InstitutionOption) => {
    const pref = readOwnerPref();
    if (pref) { startConnect(inst, pref); return; }
    setPicked(inst);
    setDontAsk(false);
    setStep("owner");
  };

  const chooseOwner = (who: OwnerType) => {
    if (dontAsk) { try { localStorage.setItem(OWNER_KEY, who); } catch { /* private mode */ } }
    if (picked) startConnect(picked, who);
  };

  /* --- views --- */

  const intro = (
    <div className="cx-intro-col">
      <h1 className="cx-h1">Connect your accounts</h1>
      <p className="cx-sub">Add your everyday accounts to see every dollar in and out.</p>
      <Constellation institutions={orderedForIntro} />
      <button type="button" className="cx-btn cx-btn-light cx-btn-block cx-intro-cta" onClick={() => setStep("choose")}>
        Connect my accounts
      </button>
      <p className="cx-intro-note">Read-only access through Australia’s Consumer Data Right. Maal can never move your money.</p>
    </div>
  );

  const picker = (
    <Dialog
      label="Add account"
      onBack={searching ? () => { resetPicker(); searchRef.current?.focus(); } : undefined}
      onClose={closeDialog}
    >
      <div className="cx-dbody">
        <label className="cx-search">
          <Search className="cx-search-icon size-[22px]" strokeWidth={1.5} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={category ? `Search ${CATEGORY_COPY[category].toLowerCase()}` : "Search banks, super funds and brokers"}
            aria-label="Search institutions"
            autoComplete="off"
          />
          {query && (
            <button type="button" className="cx-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">
              <XCircle className="size-5" strokeWidth={1.5} />
            </button>
          )}
        </label>

        {searching ? (
          <>
            <div className="cx-divider" />
            <p className="cx-section-label">{category && !query ? CATEGORY_COPY[category] : "Institutions"}</p>
            <ul className="cx-results">
              {results.map((inst) => (
                <li key={inst.id ?? inst.slug ?? inst.name}>
                  <button type="button" className="cx-row" onClick={() => pickInstitution(inst)}>
                    {inst.logo || inst.slug ? <Logo inst={inst} size={40} /> : <span className="cx-initial">{inst.name.charAt(0)}</span>}
                    <span className="cx-row-text">
                      <span className="cx-row-name">{inst.name}</span>
                      <span className="cx-row-meta">{live ? "Secure Consumer Data Right connection" : "Demo connection"}</span>
                      {inst.url && <span className="cx-row-meta">{hostOf(inst.url)}</span>}
                    </span>
                    <ChevronRight className="cx-row-chev size-5" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
              {!results.length && <li className="cx-empty">No institutions match “{query}”. You can add the account manually instead.</li>}
              <li>
                <button type="button" className="cx-row cx-add-manual" onClick={() => { resetPicker(); setStep("manual"); }}>
                  <span className="cx-plus"><Plus className="size-5" strokeWidth={1.5} /></span>
                  <span className="cx-dlabel">Add manually</span>
                </button>
              </li>
            </ul>
          </>
        ) : (
          <>
            <p className="cx-section-label" style={{ marginTop: 26 }}>Popular institutions</p>
            <div className="cx-grid">
              {popular.map((inst) => (
                <button key={inst.id ?? inst.slug ?? inst.name} type="button" className="cx-tile" onClick={() => pickInstitution(inst)} aria-label={`Connect ${inst.name}`} title={inst.name}>
                  <Logo inst={inst} size={64} />
                </button>
              ))}
            </div>
            <div className="cx-divider" />
            <p className="cx-section-label">Categories</p>
            {(["bank", "super", "investment"] as InstitutionCategory[]).map((c) => {
              const logos = byCategory(c);
              return (
                <button key={c} type="button" className="cx-cat" onClick={() => setCategory(c)}>
                  <span className="cx-cat-logos">{logos.map((i) => <Logo key={i.id ?? i.slug ?? i.name} inst={i} size={40} />)}</span>
                  <span className="cx-cat-title">
                    {c === "bank" ? "Connect bank accounts and credit cards" : c === "super" ? "Connect your super" : "Connect investment accounts"}
                  </span>
                </button>
              );
            })}
            <button type="button" className="cx-cat" onClick={() => setStep("manual")}>
              <span className="cx-cat-logos"><span className="cx-plus" style={{ width: 40, height: 40, borderRadius: "50%", background: "#EEE", display: "grid", placeItems: "center" }}><Plus className="size-5" strokeWidth={1.5} /></span></span>
              <span className="cx-cat-title">Add an account or asset manually</span>
            </button>
          </>
        )}
      </div>
    </Dialog>
  );

  const ownerDialog = picked && (
    <Dialog label="Add account" onBack={() => setStep("choose")} onClose={closeDialog} short>
      <div className="cx-dbody">
        <p className="cx-prompt">Who owns this {picked.shortName} account?</p>
        <button type="button" className="cx-owner" onClick={() => chooseOwner("self")}>
          <span className="cx-owner-av is-me">{initialsOf(firstName)}</span>
          <span className="cx-owner-name">{firstName ? `${firstName} (you)` : "Just me"}</span>
          <ChevronRight className="cx-row-chev size-5" strokeWidth={1.5} />
        </button>
        <button type="button" className="cx-owner" onClick={() => chooseOwner("joint")}>
          <span className="cx-owner-av is-joint"><UserPlus className="size-[18px]" strokeWidth={1.5} /></span>
          <span className="cx-owner-name">Joint with my partner<span className="cx-owner-sub">Shared accounts count towards your household</span></span>
          <ChevronRight className="cx-row-chev size-5" strokeWidth={1.5} />
        </button>
        <label className="cx-check">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          Don’t ask me again
        </label>
      </div>
    </Dialog>
  );

  const connectingDialog = picked && (
    <Dialog label="" onClose={closeDialog} short centred labelledBy="cx-connecting-title">
      <div className="cx-connecting">
        <h2 id="cx-connecting-title" className="cx-h1">Connecting to {picked.shortName}</h2>
        {phase === "waiting" ? (
          <p className="cx-sub">Approve read-only access in the {picked.shortName} tab that just opened,<br />then come back here.</p>
        ) : phase === "importing" ? (
          <p className="cx-sub">We’re fetching your transactions.<br />Hang tight.</p>
        ) : (
          <p className="cx-sub">That didn’t work this time.</p>
        )}
        <div className="cx-handshake" aria-hidden="true">
          <Logo inst={picked} size={40} />
          <span className={`cx-dots${phase === "importing" ? "" : " is-still"}`}><span /><span /><span /><span /></span>
          <span className="cx-maal-dest"><MaalMark size={18} /></span>
        </div>
        {(phase !== "importing" || error) && (
          <div className="cx-connecting-actions">
            {error && <p className="cx-error" role="alert">{error}</p>}
            {phase !== "importing" && (
              <button type="button" className="cx-btn cx-btn-ink cx-btn-block" onClick={() => runImport(picked, owner)}>
                {phase === "error" ? "Try again" : "I’ve finished connecting"}
              </button>
            )}
            {live && (
              <button type="button" className="cx-link" onClick={() => { const w = window.open(consentUrl(picked), "_blank"); if (w) { try { w.opener = null; } catch { /* noop */ } } }}>
                Open {picked.shortName} again
              </button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; count: number; type?: string | null }>();
    for (const a of linked) {
      const name = a.institution_name || "Account";
      const g = m.get(name) ?? { name, count: 0, type: a.institution_type };
      g.count++;
      m.set(name, g);
    }
    return [...m.values()];
  }, [linked]);

  const lastName = lastResult?.institution?.shortName ?? lastResult?.linked[0]?.institution_name ?? "your account";
  const connectedBody = (
    <div className="cx-done">
      <h1 className="cx-h1">
        Nice work{firstName ? `, ${firstName}` : ""}. You’ve successfully linked {lastName}.
      </h1>
      <p className="cx-sub">Link more accounts for a fuller picture, or start exploring Maal.</p>
      <div className="cx-linked">
        {groups.map((g) => (
          <div key={g.name} className="cx-linked-row">
            <Logo inst={{ name: g.name, shortName: g.name, logo: list.find((i) => i.name === g.name || i.shortName === g.name)?.logo ?? null }} size={33} />
            <div>
              <p className="cx-linked-name">{g.name}<span className="cx-dot" aria-label="Connected" /></p>
              <p className="cx-linked-sub">
                {g.type === "Demo" ? "Demo account" : g.type === "Manual" ? "Added manually" : `${g.count} account${g.count === 1 ? "" : "s"} connected · read-only`}
              </p>
            </div>
          </div>
        ))}
      </div>
      {lastResult?.source === "demo" && (
        <p className="cx-demo-note">Demo mode: bank connections switch on soon, so no real bank data was imported.</p>
      )}
      <div className="cx-done-actions">
        <button type="button" className="cx-btn cx-btn-line cx-btn-block" onClick={() => { resetPicker(); setStep("choose"); }}>Link another account</button>
        <button type="button" className="cx-btn cx-btn-ink cx-btn-block" onClick={() => lastResult && onDone({ ...lastResult, linked, count: Math.max(lastResult.count, linked.length) })}>
          Continue
        </button>
      </div>
    </div>
  );

  const manualGrid = (
    <Dialog label="Add account" onBack={() => setStep("choose")} onClose={closeDialog}>
      <div className="cx-dbody">
        <div className="cx-manual-grid">
          <a className="cx-mtile is-wide" href="/app/transactions" style={{ textDecoration: "none" }}>
            <span className="cx-micon"><FileUp className="size-[18px]" strokeWidth={1.5} /></span>
            <span className="cx-mtile-title">Import from a bank statement or .csv</span>
          </a>
          {MANUAL_TILES.map((t) => (
            <button key={t.kind} type="button" className="cx-mtile" onClick={() => { setManualKind(t.kind); setStep("manual-form"); }}>
              <span className="cx-micon">{t.icon}</span>
              <span className="cx-mtile-title">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );

  const manualForm = (
    <ManualForm
      kind={manualKind}
      onBack={() => setStep("manual")}
      onClose={closeDialog}
      onSaved={(name, kind) => {
        const result: ConnectResult = {
          source: "manual",
          linked: [{ id: `manual-${Date.now()}`, institution_name: name, institution_type: "Manual" }],
          count: 1,
          institution: null,
          owner: "self",
        };
        if (isApp) { onDone(result); return; }
        finishWith(result, { title: "Success", sub: kind === "debt" ? "Your debt was added." : "Your asset was created." });
      }}
    />
  );

  const dialog =
    step === "choose" ? picker
    : step === "owner" ? ownerDialog
    : step === "connecting" ? connectingDialog
    : step === "manual" ? manualGrid
    : step === "manual-form" ? manualForm
    : null;

  const toastEl = toast && <ConnectedToast title={toast.title} sub={toast.sub} onDismiss={() => setToast(null)} />;

  /* --- in-app: modal only --- */
  if (isApp) {
    return (
      <div className="cx">
        {step === "connected" ? (
          <Dialog label="Add account" onClose={closeDialog}>
            <div className="cx-dbody" style={{ display: "flex", justifyContent: "center", padding: "32px 20px 28px" }}>{connectedBody}</div>
          </Dialog>
        ) : dialog}
        {toastEl}
      </div>
    );
  }

  /* --- onboarding: full page + dialogs --- */
  const dark = step !== "connected";
  return (
    <div className={`cx cx-page${dark ? " is-dark cx-intro" : ""}`}>
      {chrome && (
        <header className="cx-top">
          {step === "connected"
            ? <button type="button" className="cx-chip-btn" onClick={() => { resetPicker(); setStep("choose"); }}>Back</button>
            : onBack ? <button type="button" className="cx-chip-btn" onClick={onBack}>Back</button> : <span className="cx-spacer" />}
          <span className="cx-logo"><MaalMark size={18} /><span>Maal</span></span>
          {step === "connected"
            ? <button type="button" className="cx-chip-btn" onClick={() => lastResult && onDone({ ...lastResult, linked, count: Math.max(lastResult.count, linked.length) })}>Close</button>
            : onSkip ? <button type="button" className="cx-chip-btn" onClick={onSkip}>Skip</button> : <span className="cx-spacer" />}
        </header>
      )}
      <main className="cx-main">{step === "connected" ? connectedBody : intro}</main>
      {chrome && (
        <footer>
          <p className="cx-foot"><a href="/security" target="_blank" rel="noreferrer">How Maal keeps your data safe</a></p>
          <div className="cx-disclaimer"><Disclaimer variant="inline" /></div>
        </footer>
      )}
      {dialog}
      {toastEl}
    </div>
  );
}

/* ---------------- Intro constellation ---------------- */

function Constellation({ institutions }: { institutions: InstitutionOption[] }) {
  if (!institutions.length) return <div className="cx-constellation" style={{ height: 380 }} aria-hidden="true" />;
  const featured = institutions.find((i) => i.slug === "commbank") ?? institutions[0];
  const pool = institutions.filter((i) => i !== featured);
  const at = (n: number) => pool[n % Math.max(pool.length, 1)] ?? featured;
  const rows = [6, 6, 6, 6, 6];
  let k = 0;
  return (
    <div className="cx-constellation" role="img" aria-label={`Supported institutions include ${institutions.slice(0, 6).map((i) => i.shortName).join(", ")} and more`}>
      {rows.map((n, r) => (
        <div key={r} className={`cx-orbit-row${r % 2 ? " is-offset" : ""}`}>
          {Array.from({ length: n }).map((_, c) => {
            const inst = at(k++);
            const ghost = (r === 1 && c === 2) || (r === 2 && (c === 2 || c === 3)) || (r === 3 && c === 2);
            return (
              <span key={c} className={`cx-orbit${ghost ? " is-ghost" : ""}`}>
                <Logo inst={inst} size={44} />
              </span>
            );
          })}
        </div>
      ))}
      <span className="cx-featured"><Logo inst={featured} size={100} /></span>
    </div>
  );
}

/* ---------------- Manual account form ---------------- */

function ManualForm({
  kind, onBack, onClose, onSaved,
}: {
  kind: ManualKind; onBack: () => void; onClose: () => void; onSaved: (name: string, kind: ManualKind) => void;
}) {
  const copy = MANUAL_HEADINGS[kind];
  const [accountType, setAccountType] = useState<BankAccountType>("transaction");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isLiability = kind === "debt" || (kind === "bank" && accountType === "credit_card");
  const total = parseDollars(amount);
  const label = kind === "bank" && accountType === "credit_card" ? "Credit cards" : copy.label;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const input = { kind, accountType, name, amount };
      await saveManual(input);
      onSaved(String(manualPayload(input).body.label), isLiability ? "debt" : kind);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "We couldn’t save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label={label} onBack={onBack} onClose={onClose}>
      <form className="cx-dbody" onSubmit={submit}>
        <p className="cx-prompt">Complete your information</p>
        <div className="cx-form">
          {kind === "bank" && (
            <label className="cx-field">
              <span className="cx-field-label">Account type</span>
              <select value={accountType} onChange={(e) => setAccountType(e.target.value as BankAccountType)}>
                <option value="transaction">Everyday</option>
                <option value="savings">Savings</option>
                <option value="credit_card">Credit card</option>
              </select>
              <ChevronDown className="cx-field-chev size-5" strokeWidth={1.5} />
            </label>
          )}
          <label className="cx-field">
            <span className="cx-field-label">{copy.name}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.placeholder} maxLength={120} required autoFocus />
          </label>
          <label className="cx-field">
            <span className="cx-field-label">{isLiability ? "Amount owing" : copy.amount}</span>
            <span className="cx-money">
              <span>$</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label={copy.amount} />
            </span>
          </label>
          <div className="cx-summary">
            <div className="cx-summary-top">
              <span>Total amount</span>
              <span className="cx-summary-total">{aud(total)}</span>
            </div>
            <div className="cx-summary-foot">
              <p>Included in your net worth</p>
              <p>{isLiability ? "Debts are subtracted from your net worth." : "Assets add up to your net worth."}</p>
            </div>
          </div>
        </div>
        {err && <p className="cx-error" role="alert" style={{ marginTop: 12 }}>{err}</p>}
        <div className="cx-form-actions" style={{ marginTop: 24 }}>
          <button type="submit" className="cx-btn cx-btn-ink" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export default ConnectAccountsFlow;
