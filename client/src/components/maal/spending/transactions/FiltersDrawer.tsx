import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import { datePresets, emptyFilters, presetFor, rangeError, type TxnFilters } from "../../../../../../shared/transactions-list.mjs";
import { iconForGroup } from "../overview/categoryIcons";
import { TxDrawer } from "./TxDrawer";
import type { AccountInfo } from "./useTransactionsData";

type Panel = "root" | "date" | "accounts" | "categories" | "amount" | "type" | "visibility" | "review";
const TITLES: Record<Panel, string> = {
  root: "Filters", date: "Date", accounts: "Accounts", categories: "Categories", amount: "Amount",
  type: "Type", visibility: "Visibility", review: "Review status",
};

/**
 * Filters drawer (HEL-93). The root lists each filter with its current value;
 * each opens a sub-panel. Changes are drafts until Apply; Clear filters resets
 * everything except the search box.
 */
export function FiltersDrawer({
  open, onOpenChange, value, onApply, accounts, groups, flags, today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TxnFilters;
  onApply: (next: TxnFilters) => void;
  accounts: Array<AccountInfo & { count: number }>;
  groups: Array<{ group: string; count: number }>;
  flags: { hidden: boolean; reviewed: boolean };
  today: Date;
}) {
  const [panel, setPanel] = useState<Panel>("root");
  const [draft, setDraft] = useState<TxnFilters>(value);
  // Each time the drawer opens, start from the filters in force.
  useEffect(() => { if (open) { setDraft(value); setPanel("root"); } }, [open, value]);

  const presets = useMemo(() => datePresets(today), [today]);
  const presetId = presetFor(draft.from, draft.to, today);
  const [custom, setCustom] = useState(false);
  useEffect(() => { if (open) setCustom(presetFor(value.from, value.to, today) === "custom"); }, [open, value, today]);

  const set = (patch: Partial<TxnFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const summary: Partial<Record<Panel, string>> = {
    date: presetId === "all" ? "" : presetId === "custom"
      ? [draft.from && fmt(draft.from), draft.to && fmt(draft.to)].filter(Boolean).join(" – ") || ""
      : presets.find((p) => p.id === presetId)?.label,
    accounts: draft.accounts.length ? `${draft.accounts.length} selected` : "",
    categories: draft.groups.length ? `${draft.groups.length} selected` : "",
    amount: draft.min != null || draft.max != null
      ? `${draft.min != null ? `$${draft.min}` : "$0"} – ${draft.max != null ? `$${draft.max}` : "any"}` : "",
    type: draft.type === "expense" ? "Money out" : draft.type === "income" ? "Money in" : "",
    visibility: draft.visibility === "hidden" ? "Hidden only" : draft.visibility === "visible" ? "Visible only" : "",
    review: draft.review === "reviewed" ? "Reviewed" : draft.review === "unreviewed" ? "Not reviewed" : "",
  };

  const amountError = draft.min != null && draft.max != null && draft.min > draft.max
    ? "The minimum is more than the maximum." : null;
  const dateError = rangeError(draft.from, draft.to, today);

  const footer = (
    <div className="tx-foot-row">
      <button type="button" className="tx-btn-line" onClick={() => { setDraft({ ...emptyFilters(), query: value.query }); setCustom(false); }}>
        Clear filters
      </button>
      <button type="button" className="tx-btn-ink" disabled={Boolean(amountError || dateError)}
        onClick={() => { onApply(draft); onOpenChange(false); }}>
        Apply
      </button>
    </div>
  );

  return (
    <TxDrawer open={open} onOpenChange={onOpenChange} title={TITLES[panel]} footer={footer}
      onBack={panel === "root" ? undefined : () => setPanel("root")} backLabel="Back to filters">
      {panel === "root" && (
        <>
          <p className="tx-section-label">Filter by</p>
          <div className="tx-rowcard">
            {(["date", "accounts", "categories", "amount", "type"] as Panel[]).map((p) => (
              <NavRow key={p} label={TITLES[p]} value={summary[p]} onClick={() => setPanel(p)} />
            ))}
          </div>
          {(flags.hidden || flags.reviewed) && (
            <>
              <p className="tx-section-label">Hide / show</p>
              <div className="tx-rowcard">
                {flags.hidden && <NavRow label={TITLES.visibility} value={summary.visibility} onClick={() => setPanel("visibility")} />}
                {flags.reviewed && <NavRow label={TITLES.review} value={summary.review} onClick={() => setPanel("review")} />}
              </div>
            </>
          )}
        </>
      )}

      {panel === "date" && (
        <>
          <fieldset className="tx-rowcard tx-fieldset">
            <legend className="sr-only">Date range</legend>
            {presets.map((p) => (
              <Choice key={p.id} name="tx-date" label={p.label} checked={!custom && presetId === p.id}
                onChange={() => { setCustom(false); set({ from: p.from, to: p.to }); }} />
            ))}
            <Choice name="tx-date" label="Custom range" checked={custom || presetId === "custom"}
              onChange={() => setCustom(true)} />
          </fieldset>
          {(custom || presetId === "custom") && (
            <div className="tx-range">
              <label className="tx-field">
                <span className="tx-field-label">Start</span>
                <input type="date" value={draft.from ?? ""} max={draft.to ?? undefined}
                  onChange={(e) => set({ from: e.target.value || null })} />
              </label>
              <span aria-hidden className="tx-range-dash">–</span>
              <label className="tx-field">
                <span className="tx-field-label">End</span>
                <input type="date" value={draft.to ?? ""} min={draft.from ?? undefined}
                  onChange={(e) => set({ to: e.target.value || null })} />
              </label>
            </div>
          )}
          {(custom || presetId === "custom") && !dateError && <p className="tx-muted tx-small m-0">You can view up to 3 years at a time.</p>}
          {dateError && <p className="tx-error" role="alert">{dateError}</p>}
        </>
      )}

      {panel === "accounts" && (
        accounts.length === 0 ? <p className="tx-muted">No accounts to filter yet.</p> : (
          <fieldset className="tx-rowcard tx-fieldset">
            <legend className="sr-only">Accounts</legend>
            {accounts.map((a) => (
              <Check2 key={a.key} checked={draft.accounts.includes(a.key)}
                onChange={() => set({ accounts: toggle(draft.accounts, a.key) })}
                icon={a.key === "manual" ? <span className="tx-acct-manual" aria-hidden>M</span> : <InstitutionLogo name={a.institution || a.label} size={24} />}
                label={a.label} meta={`${a.count}`} />
            ))}
          </fieldset>
        )
      )}

      {panel === "categories" && (
        <fieldset className="tx-rowcard tx-fieldset">
          <legend className="sr-only">Categories</legend>
          {groups.map(({ group, count }) => {
            const Icon = iconForGroup(group);
            return (
              <Check2 key={group} checked={draft.groups.includes(group)}
                onChange={() => set({ groups: toggle(draft.groups, group) })}
                icon={<span className="tx-cat-icon" aria-hidden><Icon /></span>} label={group} meta={count ? `${count}` : ""} />
            );
          })}
        </fieldset>
      )}

      {panel === "amount" && (
        <>
          <p className="tx-muted">Matches the size of the transaction, whether money went out or came in.</p>
          <div className="tx-range">
            <MoneyInput label="Minimum" value={draft.min} onChange={(min) => set({ min })} />
            <span aria-hidden className="tx-range-dash">–</span>
            <MoneyInput label="Maximum" value={draft.max} onChange={(max) => set({ max })} />
          </div>
          {amountError && <p className="tx-error" role="alert">{amountError}</p>}
        </>
      )}

      {panel === "type" && (
        <fieldset className="tx-rowcard tx-fieldset">
          <legend className="sr-only">Type</legend>
          <Choice name="tx-type" label="All transactions" checked={draft.type === "all"} onChange={() => set({ type: "all" })} />
          <Choice name="tx-type" label="Money out" checked={draft.type === "expense"} onChange={() => set({ type: "expense" })} />
          <Choice name="tx-type" label="Money in" checked={draft.type === "income"} onChange={() => set({ type: "income" })} />
        </fieldset>
      )}

      {panel === "visibility" && (
        <fieldset className="tx-rowcard tx-fieldset">
          <legend className="sr-only">Visibility</legend>
          <Choice name="tx-vis" label="Show all" checked={draft.visibility === "all"} onChange={() => set({ visibility: "all" })} />
          <Choice name="tx-vis" label="Visible only" checked={draft.visibility === "visible"} onChange={() => set({ visibility: "visible" })} />
          <Choice name="tx-vis" label="Hidden only" checked={draft.visibility === "hidden"} onChange={() => set({ visibility: "hidden" })} />
        </fieldset>
      )}

      {panel === "review" && (
        <fieldset className="tx-rowcard tx-fieldset">
          <legend className="sr-only">Review status</legend>
          <Choice name="tx-rev" label="Show all" checked={draft.review === "all"} onChange={() => set({ review: "all" })} />
          <Choice name="tx-rev" label="Not reviewed" checked={draft.review === "unreviewed"} onChange={() => set({ review: "unreviewed" })} />
          <Choice name="tx-rev" label="Reviewed" checked={draft.review === "reviewed"} onChange={() => set({ review: "reviewed" })} />
        </fieldset>
      )}
    </TxDrawer>
  );
}

function fmt(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function NavRow({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" className="tx-row" onClick={onClick}>
      <span className="tx-row-label">{label}</span>
      {value ? <span className="tx-row-value">{value}</span> : null}
      <ChevronRight className="tx-chev" aria-hidden />
    </button>
  );
}

function Choice({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="tx-row tx-choice">
      <span className="tx-row-label">{label}</span>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="tx-radio" />
    </label>
  );
}

function Check2({ label, meta, icon, checked, onChange }: { label: string; meta?: string; icon?: ReactNode; checked: boolean; onChange: () => void }) {
  return (
    <label className="tx-row tx-choice">
      {icon}
      <span className="tx-row-label">{label}</span>
      {meta ? <span className="tx-row-value">{meta}</span> : null}
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="tx-check" data-on={checked} aria-hidden>{checked && <Check />}</span>
    </label>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  // Sync from outside (Clear filters) without clobbering a half-typed "12."
  useEffect(() => {
    setText((t) => {
      const current = t === "" ? null : Number(t);
      return current === value ? t : value == null ? "" : String(value);
    });
  }, [value]);
  return (
    <label className="tx-field">
      <span className="tx-field-label">{label}</span>
      <span className="tx-money">
        <span aria-hidden>$</span>
        <input inputMode="decimal" value={text} placeholder="0.00"
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.]/g, "");
            setText(t);
            const n = Number(t);
            onChange(t === "" || !Number.isFinite(n) ? null : n);
          }} />
      </span>
    </label>
  );
}
