import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Circle, X, Sparkles } from "lucide-react";
import { getActivation, type Activation } from "@/lib/activation.functions";

const DISMISS_KEY = "maal_setup_dismissed";

/** Setup-completion checklist + proactive low-data nudge. Auto-hides once every
 *  step is done, or when the user dismisses it. */
export function SetupChecklist() {
  const [act, setAct] = useState<Activation | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { /* ignore */ }
    getActivation().then(setAct).catch(() => {});
  }, []);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  if (!act || dismissed || act.completed === act.total) return null;

  return (
    <div className="rounded-[14px] border border-border bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-[14px] font-bold tracking-display">Finish setting up Maal</h2>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      {act.lowData && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-[10px] bg-[var(--secondary)]">
          <Sparkles className="size-3.5 mt-0.5 shrink-0 text-mint" />
          <p className="text-[12px] text-muted-foreground">
            Maal can only give you real answers once it knows your finances. Add an asset or liability to get a personalised score and advice.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-foreground" style={{ width: `${act.pct}%` }} />
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">{act.completed}/{act.total}</span>
      </div>

      <ul className="space-y-1">
        {act.steps.map((s) => (
          <li key={s.id}>
            {s.done ? (
              <div className="flex items-center gap-2.5 px-2 py-1.5 text-[13px] text-muted-foreground">
                <Check className="size-4 text-mint shrink-0" />
                <span className="line-through">{s.label}</span>
              </div>
            ) : (
              <Link to={s.to} className="flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] text-[13px] hover:bg-[var(--secondary)] transition-colors">
                <Circle className="size-4 text-muted-foreground shrink-0" />
                <span>{s.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
