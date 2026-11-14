import { useEffect, useRef, useState } from "react";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import type { HomeAccount } from "../../../../../shared/home-accounts.mjs";
import { aud } from "./format";

const KIND_LABEL: Record<HomeAccount["kind"], string> = {
  cash: "Bank account",
  investment: "Investment",
  super: "Super",
  property: "Property",
  debt: "Loan",
  other: "Other asset",
};

/** "Your accounts" checklist that chooses which accounts feed the net worth card. */
export function AccountFilter({
  accounts, selected, onApply, onClear,
}: {
  accounts: HomeAccount[];
  selected: string[] | null;
  onApply: (ids: string[] | null) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected ?? accounts.map((a) => a.id)));
  const allRef = useRef<HTMLInputElement>(null);
  const all = draft.size === accounts.length;
  const none = draft.size === 0;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !all && !none;
  }, [all, none]);

  function toggle(id: string) {
    setDraft((d) => {
      const next = new Set(d);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <label className="mh-filter-head cursor-pointer">
        <span id="mh-filter-title">Your accounts</span>
        <input ref={allRef} type="checkbox" className="mh-check" checked={all}
          aria-label={all ? "Deselect all accounts" : "Select all accounts"}
          onChange={() => setDraft(all ? new Set() : new Set(accounts.map((a) => a.id)))} />
      </label>
      <ul className="mh-filter-list list-none m-0" aria-labelledby="mh-filter-title">
        {accounts.map((a) => {
          const sub = [a.reference ? `•••• ${a.reference}` : KIND_LABEL[a.kind]].join("");
          return (
            <li key={a.id}>
              <label className="mh-filter-row">
                <InstitutionLogo name={a.institution || a.name} size={32} className="rounded-full" />
                <span className="min-w-0 flex-1">
                  <span className="mh-filter-name block truncate">{a.name}</span>
                  <span className="mh-filter-sub block truncate">
                    {sub} · <span className="mh-amount">{aud(a.balance)}</span>
                  </span>
                </span>
                <input type="checkbox" className="mh-check" checked={draft.has(a.id)} onChange={() => toggle(a.id)}
                  aria-label={`Include ${a.name}`} />
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mh-filter-foot">
        <button type="button" className="mh-link-btn" onClick={onClear}>Clear filters</button>
        <button type="button" className="mh-btn-ink" disabled={none}
          onClick={() => onApply(all ? null : accounts.filter((a) => draft.has(a.id)).map((a) => a.id))}>
          Apply
        </button>
      </div>
    </div>
  );
}
