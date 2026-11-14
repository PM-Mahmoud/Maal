import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Circle, X, Sparkles, RefreshCw } from "lucide-react";
import { getActivation, type Activation } from "@/lib/activation.functions";

const DISMISS_KEY = "maal_setup_dismissed";

/** Setup-completion checklist + proactive low-data nudge. Auto-hides once every
 *  step is done, or when the user dismisses it. */
export function SetupChecklist() {
  const [act, setAct] = useState<Activation | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { /* ignore */ }
    void load();
  }, []);

  async function load() {
    setError(false);
    try {
      setAct(await getActivation());
    } catch {
      setError(true);
    }
  }

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  if (dismissed) return null;
  if (error) {
    return (
      <div role="alert" className="mh-card mh-card-body flex items-center gap-3 mh-small">
        <div className="flex-1">
          <p className="m-0 font-medium">Setup progress couldn’t be refreshed</p>
          <p className="m-0 mh-muted">Your existing financial data has not been replaced.</p>
        </div>
        <button onClick={() => void load()} className="mh-btn-outline" style={{ height: 34 }}>
          <RefreshCw aria-hidden /> Retry
        </button>
      </div>
    );
  }
  if (!act || act.completed === act.total) return null;

  return (
    <section className="mh-card mh-guide" aria-labelledby="mh-guide-title">
      <div className="mh-card-head">
        <p className="mh-card-label m-0">Your guide</p>
        <div className="mh-card-actions">
          <button onClick={dismiss} aria-label="Dismiss setup guide" className="mh-close"><X className="size-5" /></button>
        </div>
      </div>
      <div className="mh-card-body" style={{ paddingTop: 0 }}>
        <h2 id="mh-guide-title" className="mh-serif-title">Make the most of Maal</h2>
        <div className="mh-segs" role="progressbar" aria-valuemin={0} aria-valuemax={act.total} aria-valuenow={act.completed}
          aria-label={`${act.completed} of ${act.total} setup steps done`}>
          {act.steps.map((s) => <span key={s.id} className="mh-seg" data-done={s.done} />)}
        </div>
        <p className="m-0" style={{ fontSize: 15, opacity: .9 }}>{act.pct}% complete</p>

        {act.lowData && (
          <p className="flex items-start gap-2 mt-3 mb-0 mh-small" style={{ opacity: .85 }}>
            <Sparkles className="size-3.5 mt-0.5 shrink-0" aria-hidden />
            Add an account, asset or loan so Maal can give you a real score and answers about your money.
          </p>
        )}

        <ul className="mh-guide-steps">
          {act.steps.map((s) => (
            <li key={s.id}>
              {s.done ? (
                <span><Check aria-hidden /> {s.label}</span>
              ) : (
                <Link to={s.to}><Circle aria-hidden /> {s.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
