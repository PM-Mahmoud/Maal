import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { addTransaction } from "@/lib/transactions.functions";
import { setTransactionCategory, type CategoryGroup } from "@/lib/transactions-depth.functions";
import { buildManualTransaction, isoDate, type ManualForm } from "../../../../../../shared/transactions-list.mjs";
import { TxDrawer } from "./TxDrawer";

const blank = (today: Date): ManualForm => ({ type: "expense", description: "", amount: "", date: isoDate(today), group: "", category: "" });

/**
 * Add transaction (HEL-95). Reuses POST /api/v1/transactions (the same
 * endpoint CSV import uses) and, when a category is chosen, the existing
 * PATCH /api/v1/transactions/:id/category. No new storage.
 * Manual entries aren't tied to a bank account, so the Account field is fixed.
 */
export function AddTransactionDrawer({ open, onOpenChange, groups, onAdded, today }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CategoryGroup[];
  onAdded: (message: string) => void;
  today: Date;
}) {
  const [form, setForm] = useState<ManualForm>(() => blank(today));
  const [errors, setErrors] = useState<Partial<Record<"description" | "amount" | "date", string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(blank(today)); setErrors({}); setSaveError(null); } }, [open, today]);

  const set = (patch: Partial<ManualForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    // Clear a field's error as soon as the user edits it.
    setErrors((e) => {
      const next = { ...e };
      if ("description" in patch) delete next.description;
      if ("amount" in patch) delete next.amount;
      if ("date" in patch) delete next.date;
      return next;
    });
  };
  const groupOptions = groups.filter((g) => (form.type === "income" ? true : g.group !== "Income"));
  const subcats = groups.find((g) => g.group === form.group)?.categories ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildManualTransaction(form, today);
    if (!built.ok) { setErrors(built.errors); return; }
    setErrors({});
    setBusy(true);
    setSaveError(null);
    try {
      const row = (await addTransaction({ data: built.body })) as { id?: number | string } | null;
      let note = "";
      if (built.category && row?.id != null) {
        const ok = await setTransactionCategory(Number(row.id), built.category.group, built.category.category);
        if (!ok) note = " The category couldn’t be saved; you can set it from the list.";
      }
      onAdded(`Added “${built.body.description}”.${note}`);
      onOpenChange(false);
    } catch (err: any) {
      // Keep the drawer open so nothing typed is lost.
      setSaveError(err?.message ?? "Couldn’t save the transaction. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="tx-foot-row">
      <button type="button" className="tx-btn-line" onClick={() => onOpenChange(false)}>Cancel</button>
      <button type="submit" form="tx-add-form" className="tx-btn-ink" disabled={busy}>{busy ? "Saving…" : "Add transaction"}</button>
    </div>
  );

  return (
    <TxDrawer open={open} onOpenChange={onOpenChange} title="Add transaction" footer={footer}>
      <form id="tx-add-form" className="tx-form" onSubmit={submit} noValidate>
        <div className="tx-seg" role="radiogroup" aria-label="Type">
          {(["expense", "income"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={form.type === t} className="tx-seg-btn"
              onClick={() => set({ type: t, group: t === "expense" && form.group === "Income" ? "" : form.group })}>
              {t === "expense" ? "Money out" : "Money in"}
            </button>
          ))}
        </div>

        <Field label="Description" error={errors.description} htmlFor="tx-add-desc">
          <input id="tx-add-desc" value={form.description} maxLength={160} autoComplete="off"
            placeholder="e.g. Harris Farm Markets" aria-invalid={Boolean(errors.description)}
            onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <Field label="Amount" error={errors.amount} htmlFor="tx-add-amt">
          <span className="tx-money tx-money--lg">
            <span aria-hidden>$</span>
            <input id="tx-add-amt" inputMode="decimal" value={String(form.amount)} placeholder="0.00"
              aria-invalid={Boolean(errors.amount)} onChange={(e) => set({ amount: e.target.value })} />
          </span>
        </Field>

        <Field label="Category (optional)" htmlFor="tx-add-group">
          <span className="tx-select">
            <select id="tx-add-group" value={form.group} onChange={(e) => set({ group: e.target.value, category: "" })}>
              <option value="">Let Maal categorise it</option>
              {groupOptions.map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
            </select>
            <ChevronDown aria-hidden />
          </span>
        </Field>

        {subcats.length > 0 && (
          <Field label="Subcategory (optional)" htmlFor="tx-add-cat">
            <span className="tx-select">
              <select id="tx-add-cat" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">Any</option>
                {subcats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown aria-hidden />
            </span>
          </Field>
        )}

        <Field label="Date" error={errors.date} htmlFor="tx-add-date">
          <input id="tx-add-date" type="date" value={form.date} max={isoDate(today)} aria-invalid={Boolean(errors.date)}
            onChange={(e) => set({ date: e.target.value })} />
        </Field>

        <div className="tx-divider" />

        <Field label="Account" htmlFor="tx-add-acct">
          <input id="tx-add-acct" value="Manual entry" readOnly aria-describedby="tx-add-acct-help" />
        </Field>
        <p id="tx-add-acct-help" className="tx-muted tx-small">
          Manual entries count in your spending and reports but aren’t linked to a bank account. Connected accounts add transactions automatically.
        </p>

        {saveError && <p className="tx-error" role="alert">{saveError}</p>}
      </form>
    </TxDrawer>
  );
}

function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="tx-field" data-error={Boolean(error)}>
      <label className="tx-field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <span className="tx-field-error" role="alert">{error}</span>}
    </div>
  );
}
