import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { MAX_RANGE_DAYS, emptyFilters, presetLabel, resolveRange } from "../../../../../../shared/spending-reports.mjs";
import type { Interval, RangeConfig, RangePreset, ReportFilters } from "../../../../../../shared/spending-reports.mjs";
import { isoDay as isoDayOf } from "../../../../../../shared/spending-overview.mjs";
import { iconForGroup } from "../overview/categoryIcons";

/** The 18 groups of the AU taxonomy (lib/transaction-categories.js), in display order. */
export const ALL_GROUPS = [
  "Housing", "Bills & Utilities", "Food & Dining", "Auto & Transport", "Shopping", "Health & Wellness",
  "Travel & Lifestyle", "Recurring & Subscriptions", "Financial", "Education", "Children", "Gifts & Donations",
  "Business", "Savings & Investments", "Income", "Transfers", "Credit Card Payments", "Other",
];

const PRESETS: RangePreset[] = ["this-month", "last-month", "3m", "6m", "12m", "ytd", "fy", "last-fy", "custom"];
const INTERVAL_LABELS: Array<[Interval, string]> = [["week", "Week"], ["month", "Month"], ["quarter", "Quarter"]];

export type FilterDraft = { range: RangeConfig; interval: Interval; filters: ReportFilters };

/** Side panel: date range (presets + custom), grouping, category and merchant filters. */
export function FiltersDialog({ open, initial, today, onApply, onClose }: {
  open: boolean;
  initial: FilterDraft;
  today: Date;
  onApply: (d: FilterDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterDraft>(initial);
  useEffect(() => { if (open) setDraft(initial); }, [open, initial]);

  const resolved = resolveRange(draft.range, today);
  const customError = draft.range.preset === "custom" && !resolved
    ? (draft.range.from && draft.range.to && draft.range.from > draft.range.to
      ? "The start date must be on or before the end date."
      : draft.range.from && draft.range.to ? "Reports cover up to 3 years at a time." : "Choose a start and end date.")
    : null;

  function setPreset(p: RangePreset) {
    if (p === "custom") {
      // Seed the custom dates with whatever range is showing now.
      const cur = resolveRange(draft.range.preset === "custom" ? { preset: "6m" } : draft.range, today);
      setDraft({ ...draft, range: { preset: "custom", from: draft.range.from ?? cur?.from, to: draft.range.to ?? cur?.to } });
    } else setDraft({ ...draft, range: { preset: p } });
  }
  function toggleGroup(g: string) {
    const groups = draft.filters.groups.includes(g) ? draft.filters.groups.filter((x) => x !== g) : [...draft.filters.groups, g];
    setDraft({ ...draft, filters: { ...draft.filters, groups } });
  }
  const todayIso = isoDayOf(today);
  const earliest = isoDayOf(new Date(today.getFullYear() - 3, today.getMonth(), today.getDate() + 1));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="rp-scrim" />
        <DialogPrimitive.Content className="mh-shell rp-drawer" aria-describedby={undefined}>
          <div className="rp-drawer-head">
            <DialogPrimitive.Title className="rp-eyebrow">Report filters</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rp-iconbtn" aria-label="Close filters"><X aria-hidden /></DialogPrimitive.Close>
          </div>
          <form className="rp-drawer-body" onSubmit={(e) => { e.preventDefault(); if (!customError) onApply(draft); }}>
            <fieldset className="rp-field">
              <legend>Date range</legend>
              <div className="rp-chips" role="radiogroup" aria-label="Date range">
                {PRESETS.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={draft.range.preset === p} className="rp-chip" onClick={() => setPreset(p)}>
                    {presetLabel(p)}
                  </button>
                ))}
              </div>
              {draft.range.preset === "custom" && (
                <div className="rp-dates">
                  <label>
                    <span>From</span>
                    <input type="date" value={draft.range.from ?? ""} min={earliest} max={draft.range.to || todayIso}
                      onChange={(e) => setDraft({ ...draft, range: { ...draft.range, from: e.target.value } })} />
                  </label>
                  <label>
                    <span>To</span>
                    <input type="date" value={draft.range.to ?? ""} min={draft.range.from || earliest}
                      onChange={(e) => setDraft({ ...draft, range: { ...draft.range, to: e.target.value } })} />
                  </label>
                </div>
              )}
              {customError ? <p className="rp-error" role="alert">{customError}</p>
                : <p className="rp-hint">{resolved ? `${fmt(resolved.from)} – ${fmt(resolved.to)}` : ""} · up to {Math.round(MAX_RANGE_DAYS / 365)} years</p>}
            </fieldset>

            <fieldset className="rp-field">
              <legend>Group by</legend>
              <div className="rp-seg-text" role="radiogroup" aria-label="Group by">
                {INTERVAL_LABELS.map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={draft.interval === v} onClick={() => setDraft({ ...draft, interval: v })}>{label}</button>
                ))}
              </div>
            </fieldset>

            <fieldset className="rp-field">
              <legend>
                Categories
                {draft.filters.groups.length > 0 && (
                  <button type="button" className="rp-textbtn" onClick={() => setDraft({ ...draft, filters: { ...draft.filters, groups: [] } })}>Clear</button>
                )}
              </legend>
              <p className="rp-hint mt-0">{draft.filters.groups.length ? `${draft.filters.groups.length} selected` : "All categories"}</p>
              <ul className="rp-groups">
                {ALL_GROUPS.map((g) => {
                  const Icon = iconForGroup(g);
                  const on = draft.filters.groups.includes(g);
                  return (
                    <li key={g}>
                      <label className="rp-group" data-on={on}>
                        <input type="checkbox" checked={on} onChange={() => toggleGroup(g)} />
                        <span className="rp-group-icon" aria-hidden><Icon /></span>
                        <span className="rp-group-name">{g}</span>
                        <span className="rp-check" aria-hidden>{on && <Check />}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <fieldset className="rp-field">
              <legend>Merchant</legend>
              <label className="rp-input">
                <span className="sr-only">Merchant or description contains</span>
                <input type="search" maxLength={60} placeholder="e.g. Woolworths" value={draft.filters.merchant}
                  onChange={(e) => setDraft({ ...draft, filters: { ...draft.filters, merchant: e.target.value } })} />
              </label>
            </fieldset>

            <div className="rp-drawer-foot">
              <button type="button" className="mh-btn-outline" onClick={() => setDraft({ range: { preset: "6m" }, interval: "month", filters: emptyFilters() })}>Reset</button>
              <button type="submit" className="mh-btn-ink" disabled={!!customError}>Show report</button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};
