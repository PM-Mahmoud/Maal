import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight, Baby, Briefcase, Car, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDashed, Coins,
  CornerDownRight, CreditCard, Gift, GraduationCap, HeartPulse, House, Landmark, PiggyBank, Plane, Repeat,
  ShoppingBag, ShoppingBasket, X, Zap, type LucideIcon,
} from "lucide-react";
import { getCategoryGroups, type CategoryGroup } from "@/lib/transactions-depth.functions";
import {
  AMOUNT_LABELS, DIRECTION_LABELS, MATCH_LABELS, applySavedRule, auDate, conditionClauses, describeRule,
  fullDate, previewRule, saveRule, txnAmount,
  type AmountOp, type Direction, type MatchItem, type MatchType, type RuleInput, type SavedRule,
} from "./api";
import "../../../../v2-landing.css"; // v2 tokens (scoped to .v2); fonts come from index.html
import "./rules.css";

/* ============================================================
   Create rule — the right-hand panel opened from Spending
   settings ("Add rule") and from the transactions page.
   Views: main → condition/update editors → "Preview matches"
   (read-only list) or "Review rule" (pick which existing
   transactions to update) → Create rule → toast.
   ============================================================ */

type Draft = {
  match_type: MatchType;
  match_text: string;
  amount_direction: Direction;
  amount: { op: AmountOp; value: string } | null;
  categories: string[];
  date: { from: string; to: string } | null;
  category_group: string;
  category: string;
};

const EMPTY: Draft = {
  match_type: "contains", match_text: "", amount_direction: "any", amount: null,
  categories: [], date: null, category_group: "", category: "",
};

type View = "main" | "merchant" | "categories" | "amount" | "date" | "type" | "update-category" | "matches" | "review";

function toInput(d: Draft): RuleInput {
  const amountValue = d.amount && d.amount.value.trim() !== "" ? Number(d.amount.value) : null;
  return {
    match_type: d.match_type,
    match_text: d.match_text.trim(),
    amount_direction: d.amount_direction,
    conditions: {
      ...(d.amount && amountValue !== null && Number.isFinite(amountValue) ? { amount: { op: d.amount.op, value: amountValue } } : {}),
      ...(d.categories.length ? { categories: d.categories } : {}),
      ...(d.date && (d.date.from || d.date.to)
        ? { date: { ...(d.date.from ? { from: d.date.from } : {}), ...(d.date.to ? { to: d.date.to } : {}) } }
        : {}),
    },
    ...(d.category_group ? { category_group: d.category_group } : {}),
    ...(d.category ? { category: d.category } : {}),
  };
}

function hasCondition(d: Draft) {
  const i = toInput(d);
  return !!i.match_text || i.amount_direction !== "any" || Object.keys(i.conditions).length > 0;
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  "Income": Coins,
  "Credit Card Payments": CreditCard,
  "Transfers": ArrowLeftRight,
  "Financial": Landmark,
  "Savings & Investments": PiggyBank,
  "Housing": House,
  "Bills & Utilities": Zap,
  "Food & Dining": ShoppingBasket,
  "Health & Wellness": HeartPulse,
  "Auto & Transport": Car,
  "Shopping": ShoppingBag,
  "Travel & Lifestyle": Plane,
  "Education": GraduationCap,
  "Children": Baby,
  "Recurring & Subscriptions": Repeat,
  "Business": Briefcase,
  "Gifts & Donations": Gift,
  "Other": CircleDashed,
};
const GROUP_TONES: Record<string, string> = {
  "Income": "good", "Transfers": "muted", "Food & Dining": "warm", "Auto & Transport": "warm",
  "Shopping": "warm", "Health & Wellness": "pink", "Travel & Lifestyle": "blue", "Savings & Investments": "good",
  "Recurring & Subscriptions": "violet", "Bills & Utilities": "blue",
};

export function CreateRuleFlow({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated?: (rule: SavedRule) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [view, setView] = useState<View>("main");
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fresh rule each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setDraft(EMPTY);
    setView("main");
  }, [open]);

  useEffect(() => {
    if (!open || groups.length) return;
    getCategoryGroups().then(setGroups);
  }, [open, groups.length]);

  // Escape steps back out of a sub-view, then closes. Listen on window in the
  // capture phase and stop it there, so a parent Radix dialog (Spending settings
  // drawer) doesn't also close on the same key press.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (view === "main") onClose();
      else setView("main");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, view, onClose]);

  // Move focus into the panel on open / view change for keyboard users.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const live = useLiveCount(open && view === "main", draft);

  const handleCreated = useCallback((rule: SavedRule, applied: number, note?: string) => {
    setToast(note ?? (applied > 0 ? `Rule created · ${applied} transaction${applied === 1 ? "" : "s"} updated` : "Rule created"));
    onCreated?.(rule);
    onClose();
  }, [onClose, onCreated]);

  const title = view === "matches" ? "Preview matches" : view === "review" ? "Preview the updates" : "Create rule";

  return (
    <>
      {open && (
        <div className="cr cr-overlay" onClick={onClose}>
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="cr-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="cr-head">
              {view !== "main" && (
                <button type="button" className="cr-icon-btn" onClick={() => setView("main")} aria-label="Back">
                  <ChevronLeft className="size-[18px]" />
                </button>
              )}
              <p className="cr-eyebrow">{title}</p>
              <button type="button" className="cr-icon-btn cr-close" onClick={onClose} aria-label="Close">
                <X className="size-[18px]" />
              </button>
            </header>

            {view === "main" && (
              <MainView draft={draft} live={live} onOpen={setView} />
            )}
            {view === "merchant" && (
              <MerchantEditor draft={draft} onSave={(p) => { setDraft({ ...draft, ...p }); setView("main"); }} />
            )}
            {view === "categories" && (
              <CategoriesEditor draft={draft} groups={groups} onSave={(categories) => { setDraft({ ...draft, categories }); setView("main"); }} />
            )}
            {view === "amount" && (
              <AmountEditor draft={draft} onSave={(amount) => { setDraft({ ...draft, amount }); setView("main"); }} />
            )}
            {view === "date" && (
              <DateEditor draft={draft} onSave={(date) => { setDraft({ ...draft, date }); setView("main"); }} />
            )}
            {view === "type" && (
              <TypeEditor draft={draft} onSave={(amount_direction) => { setDraft({ ...draft, amount_direction }); setView("main"); }} />
            )}
            {view === "update-category" && (
              <UpdateCategoryEditor draft={draft} groups={groups}
                onSave={(category_group, category) => { setDraft({ ...draft, category_group, category }); setView("main"); }} />
            )}
            {view === "matches" && <MatchesView draft={draft} />}
            {view === "review" && <ReviewView draft={draft} onCreated={handleCreated} />}
          </div>
        </div>
      )}
      {toast && <RuleToast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

/* ---------- Live match count for the footer button ---------- */

function useLiveCount(active: boolean, draft: Draft) {
  const [state, setState] = useState<{ total: number | null; loading: boolean }>({ total: null, loading: false });
  const key = JSON.stringify(toInput(draft));
  useEffect(() => {
    if (!active || !hasCondition(draft)) { setState({ total: null, loading: false }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      previewRule(toInput(draft), { limit: 1, signal: ctrl.signal })
        .then((r) => setState({ total: r.total, loading: false }))
        .catch(() => { if (!ctrl.signal.aborted) setState({ total: null, loading: false }); });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);
  return state;
}

/* ---------- Main view ---------- */

function MainView({ draft, live, onOpen }: {
  draft: Draft;
  live: { total: number | null; loading: boolean };
  onOpen: (v: View) => void;
}) {
  const ready = hasCondition(draft);
  const canReview = ready && !!draft.category_group;
  const amountValue = draft.amount && draft.amount.value.trim() !== "" ? Number(draft.amount.value) : null;
  const dateText = draft.date?.from && draft.date?.to ? `${fullDate(draft.date.from)} – ${fullDate(draft.date.to)}`
    : draft.date?.from ? `From ${fullDate(draft.date.from)}`
    : draft.date?.to ? `Until ${fullDate(draft.date.to)}` : "";
  const previewLabel = !ready ? "Preview matches"
    : live.total === null ? (live.loading ? "Finding matches…" : "Preview matches")
    : `Preview ${live.total.toLocaleString("en-AU")} match${live.total === 1 ? "" : "es"}`;

  return (
    <>
      <div className="cr-body">
        <p className="cr-lead">If the transaction matches:</p>
        <div className="cr-list">
          <Row label="Merchant" onClick={() => onOpen("merchant")}
            value={draft.match_text.trim() ? `${MATCH_LABELS[draft.match_type]} “${draft.match_text.trim()}”` : ""} />
          <Row label="Categories" onClick={() => onOpen("categories")}
            value={draft.categories.length === 1 ? draft.categories[0] : draft.categories.length ? `${draft.categories.length} categories` : ""} />
          <Row label="Amount" onClick={() => onOpen("amount")}
            value={draft.amount && amountValue !== null ? `${AMOUNT_LABELS[draft.amount.op]} ${fmtAud(amountValue)}` : ""} />
          <Row label="Account" soon />
          <Row label="Tags" soon />
          <Row label="Date" onClick={() => onOpen("date")} value={dateText} />
          <Row label="Type" onClick={() => onOpen("type")}
            value={draft.amount_direction === "any" ? "" : DIRECTION_LABELS[draft.amount_direction]} />
        </div>

        <p className="cr-lead">Then apply these updates:</p>
        <div className="cr-list">
          <Row label="Update category" onClick={() => onOpen("update-category")}
            value={draft.category_group ? `${draft.category_group}${draft.category ? ` · ${draft.category}` : ""}` : ""} />
          <Row label="Transaction visibility" soon />
          <Row label="Rename merchant" soon />
          <Row label="Change description" soon />
          <Row label="Add tag" soon />
        </div>

        <div className="cr-or" aria-hidden="true"><span>or</span></div>
        <div className="cr-list">
          <Row label="Split" soon tall />
        </div>
      </div>

      <footer className="cr-foot">
        {ready && !draft.category_group && (
          <p className="cr-foot-hint">Choose a category update to review the rule.</p>
        )}
        <button type="button" className="cr-btn cr-btn-line" disabled={!ready} onClick={() => onOpen("matches")}>
          {previewLabel}
        </button>
        <button type="button" className="cr-btn cr-btn-ink" disabled={!canReview} onClick={() => onOpen("review")}>
          Review rule
        </button>
      </footer>
    </>
  );
}

const audFmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtAud(n: number) { return audFmt.format(n); }

function Row({ label, value, onClick, soon, tall }: {
  label: string; value?: string; onClick?: () => void; soon?: boolean; tall?: boolean;
}) {
  if (soon) {
    return (
      <div className={`cr-row is-soon${tall ? " is-tall" : ""}`} aria-disabled="true">
        <span className="cr-row-label">{label}</span>
        <span className="cr-soon">Coming soon</span>
      </div>
    );
  }
  return (
    <button type="button" className={`cr-row${tall ? " is-tall" : ""}`} onClick={onClick}>
      <span className="cr-row-label">{label}</span>
      {value ? <span className="cr-row-value">{value}</span> : null}
      <ChevronRight className="cr-row-chev" aria-hidden="true" />
    </button>
  );
}

/* ---------- Editors (one card + Reset / Save) ---------- */

function EditorShell({ label, children, onReset, onSave, saveDisabled, error }: {
  label: string; children: ReactNode; onReset: () => void; onSave: () => void; saveDisabled?: boolean; error?: string | null;
}) {
  return (
    <div className="cr-body">
      <form
        className="cr-editor"
        onSubmit={(e) => { e.preventDefault(); if (!saveDisabled) onSave(); }}
      >
        <section className="cr-card">
          <p className="cr-card-eyebrow">{label}</p>
          <div className="cr-card-body">{children}</div>
        </section>
        {error ? <p className="cr-error" role="alert">{error}</p> : null}
        <div className="cr-editor-actions">
          <button type="button" className="cr-btn cr-btn-line cr-btn-sm" onClick={onReset}>Reset</button>
          <button type="submit" className="cr-btn cr-btn-ink cr-btn-sm" disabled={saveDisabled}>Save</button>
        </div>
      </form>
    </div>
  );
}

function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="cr-field cr-field-select">
      <span className="cr-field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="cr-field-chev" aria-hidden="true" />
    </label>
  );
}

function MerchantEditor({ draft, onSave }: { draft: Draft; onSave: (p: Pick<Draft, "match_type" | "match_text">) => void }) {
  const [type, setType] = useState<MatchType>(draft.match_type);
  const [text, setText] = useState(draft.match_text);
  return (
    <EditorShell label="Merchant" onReset={() => { setType("contains"); setText(""); }}
      onSave={() => onSave({ match_type: type, match_text: text.trim().slice(0, 120) })}>
      <SelectField label="Match type" value={type} onChange={setType}
        options={(Object.keys(MATCH_LABELS) as MatchType[]).map((v) => ({ value: v, label: MATCH_LABELS[v] }))} />
      <label className="cr-field">
        <span className="cr-field-label">Merchant or description</span>
        <input value={text} maxLength={120} autoFocus onChange={(e) => setText(e.target.value)} placeholder="e.g. Woolworths" />
      </label>
      <p className="cr-help">Matches the transaction description, ignoring capitals.</p>
    </EditorShell>
  );
}

function AmountEditor({ draft, onSave }: { draft: Draft; onSave: (a: Draft["amount"]) => void }) {
  const [op, setOp] = useState<AmountOp>(draft.amount?.op ?? "eq");
  const [value, setValue] = useState(draft.amount?.value ?? "");
  const n = Number(value);
  const invalid = value.trim() !== "" && (!Number.isFinite(n) || n < 0);
  return (
    <EditorShell label="Amount" onReset={() => { setOp("eq"); setValue(""); }}
      saveDisabled={invalid} error={invalid ? "Enter an amount of $0 or more." : null}
      onSave={() => onSave(value.trim() === "" ? null : { op, value: String(Math.round(n * 100) / 100) })}>
      <SelectField label="Amount type" value={op} onChange={setOp}
        options={(Object.keys(AMOUNT_LABELS) as AmountOp[]).map((v) => ({ value: v, label: AMOUNT_LABELS[v] }))} />
      <label className="cr-field">
        <span className="cr-field-label">Amount</span>
        <span className="cr-money">
          <span aria-hidden="true">$</span>
          <input inputMode="decimal" value={value} placeholder="0.00" aria-label="Amount in dollars"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} />
        </span>
      </label>
      <p className="cr-help">Compared on the size of the transaction, whether money in or out.</p>
    </EditorShell>
  );
}

function CategoriesEditor({ draft, groups, onSave }: { draft: Draft; groups: CategoryGroup[]; onSave: (c: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>(draft.categories);
  const toggle = (g: string) => setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  return (
    <EditorShell label="Categories" onReset={() => setPicked([])} onSave={() => onSave(picked)}>
      {!groups.length ? <p className="cr-help">Loading categories…</p> : (
        <div className="cr-options" role="group" aria-label="Categories">
          {groups.map((g) => {
            const Icon = GROUP_ICONS[g.group] ?? CircleDashed;
            const on = picked.includes(g.group);
            return (
              <button key={g.group} type="button" className={`cr-option${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggle(g.group)}>
                <Icon className="cr-option-icon" aria-hidden="true" />
                <span>{g.group}</span>
                <span className="cr-check" aria-hidden="true">{on ? <Check className="size-3" /> : null}</span>
              </button>
            );
          })}
        </div>
      )}
    </EditorShell>
  );
}

function DateEditor({ draft, onSave }: { draft: Draft; onSave: (d: Draft["date"]) => void }) {
  const [from, setFrom] = useState(draft.date?.from ?? "");
  const [to, setTo] = useState(draft.date?.to ?? "");
  const invalid = !!from && !!to && from > to;
  return (
    <EditorShell label="Date" onReset={() => { setFrom(""); setTo(""); }}
      saveDisabled={invalid} error={invalid ? "The start date must be on or before the end date." : null}
      onSave={() => onSave(from || to ? { from, to } : null)}>
      <div className="cr-field-pair">
        <label className="cr-field">
          <span className="cr-field-label">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="cr-field">
          <span className="cr-field-label">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="cr-help">Leave either side empty for an open-ended range.</p>
    </EditorShell>
  );
}

function TypeEditor({ draft, onSave }: { draft: Draft; onSave: (d: Direction) => void }) {
  const [dir, setDir] = useState<Direction>(draft.amount_direction);
  return (
    <EditorShell label="Type" onReset={() => setDir("any")} onSave={() => onSave(dir)}>
      <div className="cr-options" role="radiogroup" aria-label="Transaction type">
        {(["any", "debit", "credit"] as Direction[]).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={dir === d} className={`cr-option${dir === d ? " is-on" : ""}`} onClick={() => setDir(d)}>
            <span>{DIRECTION_LABELS[d]}</span>
            <span className="cr-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
    </EditorShell>
  );
}

function UpdateCategoryEditor({ draft, groups, onSave }: {
  draft: Draft; groups: CategoryGroup[]; onSave: (group: string, category: string) => void;
}) {
  const [group, setGroup] = useState(draft.category_group);
  const [category, setCategory] = useState(draft.category);
  const subs = groups.find((g) => g.group === group)?.categories ?? [];
  return (
    <EditorShell label="Update category" onReset={() => { setGroup(""); setCategory(""); }}
      onSave={() => onSave(group, group ? category : "")}>
      {!groups.length ? <p className="cr-help">Loading categories…</p> : (
        <>
          <SelectField label="Category" value={group}
            onChange={(v) => { setGroup(v); setCategory(""); }}
            options={[{ value: "", label: "Choose a category" }, ...groups.map((g) => ({ value: g.group, label: g.group }))]} />
          <SelectField label="Sub-category (optional)" value={category} onChange={setCategory}
            options={[{ value: "", label: subs.length ? "Any" : "Choose a category first" }, ...subs.map((c) => ({ value: c, label: c }))]} />
        </>
      )}
    </EditorShell>
  );
}

/* ---------- Matches (read-only) + Review (selectable) ---------- */

function useMatches(draft: Draft) {
  const input = useMemo(() => toInput(draft), [draft]);
  const [items, setItems] = useState<MatchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);

  const load = useCallback(async (offset: number) => {
    if (offset === 0) setStatus("loading"); else setMore(true);
    try {
      const r = await previewRule(input, { limit: 50, offset });
      setTotal(r.total);
      setItems((prev) => (offset === 0 ? r.items : [...prev, ...r.items]));
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load matching transactions.");
      if (offset === 0) setStatus("error");
    } finally {
      setMore(false);
    }
  }, [input]);

  useEffect(() => { load(0); }, [load]);
  return { items, total, status, error, more, loadMore: () => load(items.length), retry: () => load(0) };
}

function MatchRow({ item, muted, trailing }: { item: MatchItem; muted?: boolean; trailing?: ReactNode }) {
  const Icon = (item.category_group && GROUP_ICONS[item.category_group]) || CircleDashed;
  const tone = (item.category_group && GROUP_TONES[item.category_group]) || "muted";
  return (
    <li className={`cr-txn${muted ? " is-muted" : ""}`}>
      <Icon className={`cr-txn-icon tone-${tone}`} aria-hidden="true" />
      <span className="cr-txn-main">
        <span className="cr-txn-name">{item.description || "Transaction"}</span>
        <span className="cr-txn-date">{auDate(item.post_date)}{item.status === "pending" ? " · Pending" : ""}</span>
      </span>
      <span className={`cr-txn-amt${item.amount > 0 ? " is-in" : ""}`}>{txnAmount(item.amount)}</span>
      {trailing}
    </li>
  );
}

function ListStates({ status, error, total, retry, emptyText }: {
  status: "loading" | "ready" | "error"; error: string; total: number; retry: () => void; emptyText: string;
}) {
  if (status === "loading") {
    return (
      <ul className="cr-txns" aria-busy="true" aria-label="Loading matches">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="cr-txn is-skeleton"><span className="cr-skel cr-skel-icon" /><span className="cr-skel cr-skel-line" /><span className="cr-skel cr-skel-amt" /></li>
        ))}
      </ul>
    );
  }
  if (status === "error") {
    return (
      <div className="cr-state" role="alert">
        <p>{error}</p>
        <button type="button" className="cr-btn cr-btn-line cr-btn-sm" onClick={retry}>Try again</button>
      </div>
    );
  }
  if (total === 0) return <div className="cr-state"><p>{emptyText}</p></div>;
  return null;
}

function LoadMore({ shown, total, busy, onMore }: { shown: number; total: number; busy: boolean; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="cr-more">
      <span>Showing {shown.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")}</span>
      <button type="button" className="cr-btn cr-btn-line cr-btn-sm" onClick={onMore} disabled={busy}>
        {busy ? "Loading…" : "Show more"}
      </button>
    </div>
  );
}

function MatchesView({ draft }: { draft: Draft }) {
  const m = useMatches(draft);
  return (
    <div className="cr-body">
      <section className="cr-card cr-card-list">
        <p className="cr-card-eyebrow">
          {m.status === "ready" ? `${m.total.toLocaleString("en-AU")} transaction match${m.total === 1 ? "" : "es"}` : "Transaction matches"}
        </p>
        <ListStates status={m.status} error={m.error} total={m.total} retry={m.retry}
          emptyText="No transactions match these conditions yet. New transactions that match will still be updated once you create the rule." />
        {m.status === "ready" && m.total > 0 && (
          <>
            <ul className="cr-txns">{m.items.map((it) => <MatchRow key={it.id} item={it} />)}</ul>
            <LoadMore shown={m.items.length} total={m.total} busy={m.more} onMore={m.loadMore} />
          </>
        )}
      </section>
      <p className="cr-help cr-help-pad">Transactions you've categorised yourself are never changed by a rule.</p>
    </div>
  );
}

function ReviewView({ draft, onCreated }: { draft: Draft; onCreated: (rule: SavedRule, applied: number, note?: string) => void }) {
  const m = useMatches(draft);
  const input = useMemo(() => toInput(draft), [draft]);
  // Selection: "all on" with exceptions, or "all off" with exceptions — so
  // matches not yet loaded follow the select-all choice.
  const [allOn, setAllOn] = useState(true);
  const [except, setExcept] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isOn = (id: number) => (allOn ? !except.has(id) : except.has(id));
  const toggle = (id: number) => setExcept((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedCount = allOn ? m.total - except.size : except.size;
  const headerChecked = allOn && except.size === 0;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const rule = await saveRule(input);
      let applied = 0;
      if (selectedCount > 0) {
        try {
          applied = await applySavedRule(rule.id, allOn ? { exclude_ids: [...except] } : { include_ids: [...except] });
        } catch {
          // The rule exists; say so honestly rather than pretending it failed.
          onCreated(rule, 0, "Rule created — existing transactions weren't updated. Try “Apply rules” on Transactions.");
          return;
        }
      }
      onCreated(rule, applied);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the rule.");
    } finally {
      setBusy(false);
    }
  }

  const clauses = conditionClauses(input);

  return (
    <>
      <div className="cr-body">
        <section className="cr-card cr-review">
          <p className="cr-summary">{describeRule(input)}</p>
          <div className="cr-update">
            <span className="cr-update-label">Category</span>
            <span className="cr-update-value">
              <CornerDownRight className="size-4" aria-hidden="true" />
              {draft.category_group}{draft.category ? ` · ${draft.category}` : ""}
            </span>
          </div>
          {clauses.length > 1 && <p className="cr-help">All {clauses.length} conditions must match.</p>}
          <p className="cr-review-lead">The following transactions and future matches will be assigned to this category:</p>

          <div className="cr-card cr-card-list cr-card-inset">
            <div className="cr-select-head">
              <p className="cr-card-eyebrow">
                {m.status === "ready" ? `${m.total.toLocaleString("en-AU")} transaction${m.total === 1 ? "" : "s"} matched` : "Transactions matched"}
              </p>
              {m.status === "ready" && m.total > 0 && (
                <label className="cr-select-all">
                  <span>Select all</span>
                  <input type="checkbox" className="cr-checkbox" checked={headerChecked}
                    onChange={() => { setAllOn(!headerChecked); setExcept(new Set()); }} />
                </label>
              )}
            </div>
            <ListStates status={m.status} error={m.error} total={m.total} retry={m.retry}
              emptyText="Nothing matches yet — the rule will apply to new transactions as they arrive." />
            {m.status === "ready" && m.total > 0 && (
              <>
                <ul className="cr-txns">
                  {m.items.map((it) => (
                    <MatchRow key={it.id} item={it} muted={!isOn(it.id)} trailing={
                      <input type="checkbox" className="cr-checkbox" checked={isOn(it.id)} onChange={() => toggle(it.id)}
                        aria-label={`Update ${it.description || "transaction"} on ${auDate(it.post_date)}`} />
                    } />
                  ))}
                </ul>
                <LoadMore shown={m.items.length} total={m.total} busy={m.more} onMore={m.loadMore} />
              </>
            )}
          </div>
        </section>
      </div>
      <footer className="cr-foot cr-foot-shaded">
        {error ? <p className="cr-error cr-foot-error" role="alert">{error}</p> : null}
        <button type="button" className="cr-btn cr-btn-ink" onClick={create} disabled={busy || m.status === "loading"}>
          {busy ? "Creating…" : "Create rule"}
        </button>
      </footer>
    </>
  );
}

/* ---------- Toast ---------- */

function RuleToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="cr cr-toast" role="status" aria-live="polite">
      <Check className="cr-toast-tick" aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="cr-icon-btn" onClick={onDismiss} aria-label="Dismiss">
        <X className="size-4" />
      </button>
      <span className="cr-toast-bar" aria-hidden="true" />
    </div>
  );
}

export default CreateRuleFlow;
