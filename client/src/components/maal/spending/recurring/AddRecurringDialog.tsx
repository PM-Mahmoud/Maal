import { useMemo, useState, type FormEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarDays, ChevronDown, ChevronLeft, EyeOff, PenLine, Search, X } from "lucide-react";
import {
  FREQUENCIES, FREQUENCY_LABELS, KINDS, KIND_LABELS, isoDay, parseDay, suggestKind, suggestNextDate,
  validateRecurringInput, type Frequency, type RecurringKind,
} from "../../../../../../shared/recurring.mjs";
import { DEFAULT_EXCLUDED_GROUPS, groupOf } from "../../../../../../shared/spending-overview.mjs";
import { audCents, signedCents } from "@/components/maal/home/format";
import { iconForGroup } from "../overview/categoryIcons";
import { catColour } from "../categoryColour";
import {
  createRecurringItem, manualRowId, updateRecurringItem, type RecurringItem,
} from "./api";
import { KindIcon } from "./KindIcon";
import type { RecurringTxn } from "./useRecurringData";

export type DialogMode = { mode: "add" } | { mode: "edit"; item: RecurringItem };

type Draft = {
  name: string;
  amount: string;
  frequency: Frequency;
  kind: RecurringKind;
  next_date: string;
  category_group: string | null;
  transaction_id: string | null;
  source_key: string | null;
};

/**
 * Add / edit a recurring transaction (Figma HEL-105 "Adding recurring
 * transactions from Recurring"). Add: pick one of your recent transactions
 * (or add one manually) → amount, frequency, type, next payment date → Save.
 * Edit reuses the form. Editing a detected item saves a manual item that
 * replaces it (source_key = its merchant_key).
 */
export function AddRecurringDialog({ state, items = [], transactions, transactionsError, today, onClose, onSaved }: {
  state: DialogMode;
  /** Current recurring items: a picked transaction matching a detected one replaces it instead of duplicating. */
  items?: RecurringItem[];
  transactions: RecurringTxn[];
  transactionsError?: boolean;
  today: Date;
  onClose: () => void;
  onSaved: (msg: string, item: RecurringItem) => void;
}) {
  const editing = state.mode === "edit" ? state.item : null;
  const [step, setStep] = useState<"pick" | "form">(editing ? "form" : "pick");
  const [picked, setPicked] = useState<RecurringTxn | null>(null);
  const [draft, setDraft] = useState<Draft>(() => editing ? {
    name: editing.merchant,
    amount: Number(editing.averageAmount).toFixed(2),
    frequency: editing.cadence,
    kind: editing.kind,
    next_date: editing.nextEstimate,
    category_group: editing.category_group ?? null,
    transaction_id: null,
    source_key: editing.source === "detected" ? editing.merchant_key ?? null : null,
  } : blankDraft(today));

  function pick(t: RecurringTxn) {
    const name = String(t.merchant || t.description || "Recurring payment").trim().slice(0, 80);
    // Already detected under the same name? Save over it rather than adding a duplicate.
    const match = items.find((i) => i.source === "detected" && i.merchant_key && i.merchant.trim().toLowerCase() === name.toLowerCase());
    const frequency: Frequency = match?.cadence ?? "monthly";
    setPicked(t);
    setDraft({
      name,
      amount: Math.abs(Number(t.amount) || 0).toFixed(2),
      frequency,
      kind: match?.kind ?? suggestKind(t),
      next_date: suggestNextDate(t.post_date, frequency, today),
      category_group: t.category_group || null,
      transaction_id: t.id != null ? String(t.id) : null,
      source_key: match?.merchant_key ?? null,
    });
    setStep("form");
  }

  function manual() {
    setPicked(null);
    setDraft(blankDraft(today));
    setStep("form");
  }

  const title = editing ? "Edit recurring transaction" : "Add recurring transaction";
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ss-scrim" />
        <DialogPrimitive.Content className="mh-shell rc-dialog" data-step={step} aria-describedby={undefined}>
          <header className="rc-dialog-head">
            {step === "form" && !editing && (
              <button type="button" className="ss-iconbtn" onClick={() => setStep("pick")} aria-label="Back to recent transactions">
                <ChevronLeft aria-hidden />
              </button>
            )}
            <DialogPrimitive.Title className="ss-eyebrow">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="ss-iconbtn ss-close" aria-label="Close">
              <X aria-hidden />
            </DialogPrimitive.Close>
          </header>
          {step === "pick" ? (
            <PickStep transactions={transactions} error={transactionsError} onPick={pick} onManual={manual} />
          ) : (
            <FormStep draft={draft} setDraft={setDraft} picked={picked} editing={editing} today={today}
              onSaved={onSaved} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function blankDraft(today: Date): Draft {
  return { name: "", amount: "", frequency: "monthly", kind: "bill", next_date: isoDay(today), category_group: null, transaction_id: null, source_key: null };
}

const dayHeading = (iso: string) => {
  const d = parseDay(iso);
  return d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";
};

/** Step 1: search + recent transactions grouped by day. Money that isn't spending (transfers etc.) is greyed. */
function PickStep({ transactions, error, onPick, onManual }: {
  transactions: RecurringTxn[];
  error?: boolean;
  onPick: (t: RecurringTxn) => void;
  onManual: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = [...transactions]
      .filter((t) => t.post_date && Number(t.amount))
      .filter((t) => !needle || `${t.merchant || ""} ${t.description || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => String(b.post_date).localeCompare(String(a.post_date)))
      .slice(0, 80);
    const m = new Map<string, RecurringTxn[]>();
    for (const t of rows) {
      const day = String(t.post_date).slice(0, 10);
      m.set(day, [...(m.get(day) || []), t]);
    }
    return [...m.entries()];
  }, [transactions, q]);

  return (
    <div className="rc-pick">
      <div className="rc-pick-top">
        <label className="rc-search">
          <Search aria-hidden />
          <span className="sr-only">Search transactions</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions" autoComplete="off" />
        </label>
        <button type="button" className="rc-manual" onClick={onManual}>
          <PenLine aria-hidden /> Add one manually
        </button>
        <p className="rc-eyebrow-sm">Recent transactions</p>
      </div>
      <div className="rc-pick-list">
        {error ? (
          <p className="ss-muted ss-pad">Your transactions couldn’t load right now. You can still add a recurring item manually.</p>
        ) : groups.length === 0 ? (
          <p className="ss-muted ss-pad">
            {q ? "No transactions match that search." : "No transactions yet. Connect a bank, or add a recurring item manually."}
          </p>
        ) : groups.map(([day, rows]) => (
          <section key={day} aria-label={dayHeading(day)}>
            <h3 className="rc-day-head">{dayHeading(day)}</h3>
            <ul className="rc-txns">
              {rows.map((t, i) => {
                const amt = Number(t.amount) || 0;
                const group = groupOf(t);
                const muted = Boolean(t.relationship_type) || DEFAULT_EXCLUDED_GROUPS.includes(group);
                const Icon = iconForGroup(group);
                const name = t.merchant || t.description || "Transaction";
                return (
                  <li key={t.id ?? `${day}-${i}`}>
                    <button type="button" className="rc-txn" data-muted={muted} onClick={() => onPick(t)}
                      aria-label={`${name}, ${amt > 0 ? "received" : "spent"} ${audCents(Math.abs(amt))}. Make recurring`}>
                      <Icon className="rc-txn-icon" style={{ color: catColour(group) }} aria-hidden />
                      <span className="rc-txn-name">{name}</span>
                      {muted && <EyeOff className="rc-txn-hidden" aria-hidden />}
                      <span className="rc-txn-amt mh-amount" data-in={amt > 0 && !muted}>
                        {amt > 0 ? signedCents(amt) : audCents(Math.abs(amt))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function FormStep({ draft, setDraft, picked, editing, today, onSaved }: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  picked: RecurringTxn | null;
  editing: RecurringItem | null;
  today: Date;
  onSaved: (msg: string, item: RecurringItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const showName = !picked;
  const PickedIcon = picked ? iconForGroup(groupOf(picked)) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validateRecurringInput({
      name: draft.name, amount: draft.amount, frequency: draft.frequency, kind: draft.kind, next_date: draft.next_date,
      category_group: draft.category_group, source_key: draft.source_key, transaction_id: draft.transaction_id,
    });
    const valid = v.item;
    if (!valid) { setError(v.error || "Check the details and try again."); return; }
    setBusy(true);
    setError(null);
    try {
      const rowId = editing ? manualRowId(editing) : null;
      if (rowId) {
        const { name, amount, frequency, kind, next_date } = valid;
        const item = await updateRecurringItem(rowId, { name, amount, frequency, kind, next_date });
        onSaved("Recurring transaction updated.", item);
      } else {
        const item = await createRecurringItem(valid as Parameters<typeof createRecurringItem>[0]);
        onSaved(editing ? "Recurring transaction updated." : "Recurring transaction created.", item);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="rc-form" onSubmit={submit} noValidate>
      {picked && PickedIcon && (
        <p className="rc-form-merchant">
          <PickedIcon aria-hidden /> <span>{draft.name}</span>
        </p>
      )}
      {editing && editing.source === "detected" && (
        <p className="ss-muted ss-small m-0">Maal spotted this from your transactions. Saving keeps your version instead.</p>
      )}
      {showName && (
        <label className="rc-field">
          <span className="rc-field-label">Name</span>
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="e.g. Rent, Netflix, Salary" required />
        </label>
      )}
      <label className="rc-field">
        <span className="rc-field-label">Amount</span>
        <span className="rc-field-row">
          <span aria-hidden>$</span>
          <input inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" required aria-describedby="rc-amount-note" />
        </span>
        <span id="rc-amount-note" className="sr-only">Australian dollars</span>
      </label>
      <label className="rc-field rc-field--select">
        <span className="rc-field-label">Frequency</span>
        <select value={draft.frequency} onChange={(e) => {
          const frequency = e.target.value as Frequency;
          // Re-suggest the next date from the picked transaction when the cadence changes.
          setDraft({ ...draft, frequency, next_date: picked ? suggestNextDate(picked.post_date, frequency, today) : draft.next_date });
        }}>
          {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
        </select>
        <ChevronDown aria-hidden />
      </label>
      <label className="rc-field rc-field--select">
        <span className="rc-field-label">Recurring type</span>
        <select value={draft.kind} onChange={(e) => set("kind", e.target.value as RecurringKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
        <span className="rc-field-kind" aria-hidden><KindIcon kind={draft.kind} /></span>
        <ChevronDown aria-hidden />
      </label>
      <label className="rc-field rc-field--date">
        <span className="rc-field-label">{draft.kind === "income" ? "Next expected date" : "Next payment date"}</span>
        <input type="date" value={draft.next_date} onChange={(e) => set("next_date", e.target.value)} required />
        <CalendarDays aria-hidden />
      </label>
      {error && <p className="rc-error" role="alert">{error}</p>}
      <div className="rc-form-foot">
        <button type="submit" className="mh-btn-ink" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
