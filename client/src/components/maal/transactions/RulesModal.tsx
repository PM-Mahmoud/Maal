import { useEffect, useState } from "react";
import { X, Trash2, Sparkles } from "lucide-react";
import { getCategoryGroups, listRules, createRule, deleteRule, applyRules, type TxnRule, type CategoryGroup } from "@/lib/transactions-depth.functions";

/** Manage auto-categorisation rules and apply them across all transactions. */
export function RulesModal({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const [rules, setRules] = useState<TxnRule[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [draft, setDraft] = useState({ match_type: "contains", match_text: "", category_group: "", category: "" });
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() { setRules(await listRules()); }
  useEffect(() => { refresh(); getCategoryGroups().then(setGroups); }, []);
  // Close on Escape for keyboard/screen-reader users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const subCats = groups.find((g) => g.group === draft.category_group)?.categories ?? [];

  async function add() {
    if (!draft.match_text.trim() || !draft.category_group) return;
    setBusy(true);
    try {
      const ok = await createRule(draft);
      if (ok) { setDraft({ match_type: "contains", match_text: "", category_group: "", category: "" }); refresh(); }
    } finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true);
    try {
      const n = await applyRules();
      setToast(`Categorised ${n} transaction${n === 1 ? "" : "s"}.`);
      setTimeout(() => setToast(null), 3000);
      onApplied?.();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Transaction rules"
        className="w-full max-w-xl rounded-[16px] border border-border bg-[var(--surface)] p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold tracking-display">Transaction rules</h3>
          <button onClick={onClose} aria-label="Close"><X className="size-4 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4">
          Rules auto-categorise matching transactions (historical and incoming). Earlier rules win when more than one matches.
        </p>

        {/* New rule */}
        <div className="rounded-[10px] border border-border p-3 mb-4 space-y-2">
          <div className="flex gap-2">
            <select value={draft.match_type} onChange={(e) => setDraft({ ...draft, match_type: e.target.value })}
              className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px]">
              <option value="contains">Contains</option>
              <option value="starts_with">Starts with</option>
              <option value="equals">Equals</option>
            </select>
            <input value={draft.match_text} onChange={(e) => setDraft({ ...draft, match_text: e.target.value })}
              placeholder="Text to match (e.g. NETFLIX)"
              className="flex-1 rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-[12px] outline-none" />
          </div>
          <div className="flex gap-2">
            <select value={draft.category_group} onChange={(e) => setDraft({ ...draft, category_group: e.target.value, category: "" })}
              className="flex-1 rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px]">
              <option value="">Category group…</option>
              {groups.map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
            </select>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} disabled={!subCats.length}
              className="flex-1 rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] disabled:opacity-50">
              <option value="">Sub-category (optional)</option>
              {subCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={add} disabled={busy || !draft.match_text.trim() || !draft.category_group}
              className="bg-foreground text-background px-3 rounded-[8px] text-[12px] font-semibold disabled:opacity-40">Add</button>
          </div>
        </div>

        {/* Existing rules */}
        {rules.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No rules yet.</p>
        ) : (
          <ul className="space-y-1.5 mb-4">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[12.5px] px-3 py-2 rounded-[8px] border border-border">
                <span className="flex-1">
                  <span className="text-muted-foreground">{r.match_type.replace("_", " ")}</span> "<span className="font-medium">{r.match_text}</span>" → {r.category_group}{r.category ? ` · ${r.category}` : ""}
                </span>
                <button onClick={() => deleteRule(r.id).then(refresh)} aria-label="Delete rule" className="text-muted-foreground hover:text-red-500"><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between">
          {toast ? <span className="text-[12px] text-mint">{toast}</span> : <span />}
          <button onClick={apply} disabled={busy || rules.length === 0}
            className="inline-flex items-center gap-1.5 bg-foreground text-background px-4 py-2 rounded-[10px] text-[13px] font-semibold disabled:opacity-40">
            <Sparkles className="size-3.5" /> Apply rules to all transactions
          </button>
        </div>
      </div>
    </div>
  );
}
