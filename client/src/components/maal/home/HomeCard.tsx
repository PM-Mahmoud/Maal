import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { createThread } from "@/lib/advisor.functions";

/** Card shell: uppercase label (optionally a link with chevron), right-side actions, body. */
export function HomeCard({
  label, to, actions, children, className = "", bodyClassName = "mh-card-body", labelId,
}: {
  label: string;
  to?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  labelId?: string;
}) {
  return (
    <section className={`mh-card ${className}`} aria-labelledby={labelId}>
      <div className="mh-card-head">
        {to ? (
          <Link to={to} className="mh-card-label" id={labelId}>{label}<ChevronRight aria-hidden /></Link>
        ) : (
          <h2 className="mh-card-label m-0 font-normal" id={labelId}>{label}</h2>
        )}
        {actions && <div className="mh-card-actions">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * The sparkle "ask about this" button. Starts a new Ask Maal thread with a
 * prepared question (auto-sent once via the maal_autosend_<id> handoff the
 * thread page already honours). Falls back to opening Ask Maal.
 */
export function AskSparkButton({ question, label }: { question: string; label: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const thread = (await createThread()) as { id: string };
      try { localStorage.setItem(`maal_autosend_${thread.id}`, question); } catch { /* ignore */ }
      navigate({ to: "/app/advisor/$threadId", params: { threadId: thread.id } });
    } catch {
      navigate({ to: "/app/advisor" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="mh-spark-btn cursor-pointer" onClick={go} disabled={busy} aria-label={label} title={label}>
      <Sparkles aria-hidden />
    </button>
  );
}
