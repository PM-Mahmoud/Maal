import { useEffect, useState } from "react";
import { X, Trash2, Sparkles, Plus, CornerDownRight } from "lucide-react";
import { listRules, deleteRule, applyRules, type TxnRule } from "@/lib/transactions-depth.functions";
import { CreateRuleFlow } from "@/components/maal/spending/rules/CreateRuleFlow";
import { describeRule, describeUpdate } from "@/components/maal/spending/rules/api";

/** Manage auto-categorisation rules and apply them across all transactions.
 *  New rules are created in the redesigned Create rule panel. */
export function RulesModal({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const [rules, setRules] = useState<TxnRule[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  async function refresh() { setRules(await listRules()); }
  useEffect(() => { refresh(); }, []);
  // Close on Escape for keyboard/screen-reader users (the create panel handles its own).
  useEffect(() => {
    if (creating) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, creating]);

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
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="Transaction rules"
          className="w-full max-w-xl rounded-[16px] border border-border bg-[var(--surface)] p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-bold tracking-display">Transaction rules</h3>
            <button onClick={onClose} aria-label="Close"><X className="size-4 text-muted-foreground hover:text-foreground" /></button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Rules auto-categorise matching transactions. Higher-priority rules win when more than one matches.
          </p>

          {rules.length === 0 ? (
            <p className="text-[12px] text-muted-foreground mb-4">No rules yet.</p>
          ) : (
            <ul className="space-y-1.5 mb-4">
              {rules.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-[12.5px] px-3 py-2 rounded-[8px] border border-border">
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium">{describeRule(r)}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                      <CornerDownRight className="size-3" aria-hidden="true" /> {describeUpdate(r)}
                    </span>
                  </span>
                  <button onClick={() => deleteRule(r.id).then(refresh)} aria-label="Delete rule" className="mt-0.5 text-muted-foreground hover:text-red-500"><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}

          <button onClick={() => setCreating(true)}
            className="w-full mb-4 inline-flex items-center justify-center gap-1.5 border border-border rounded-[8px] py-2 text-[13px] font-medium hover:border-foreground/40">
            <Plus className="size-3.5" /> Add rule
          </button>

          <div className="flex items-center justify-between">
            {toast ? <span className="text-[12px] text-mint">{toast}</span> : <span />}
            <button onClick={apply} disabled={busy || rules.length === 0}
              className="inline-flex items-center gap-1.5 bg-foreground text-background px-4 py-2 rounded-[10px] text-[13px] font-semibold disabled:opacity-40">
              <Sparkles className="size-3.5" /> Apply rules to all transactions
            </button>
          </div>
        </div>
      </div>
      <CreateRuleFlow open={creating} onClose={() => setCreating(false)} onCreated={() => { refresh(); onApplied?.(); }} />
    </>
  );
}
