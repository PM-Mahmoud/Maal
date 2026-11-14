import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { createThread } from "@/lib/advisor.functions";

const CHIPS = [
  "Am I on track to retire?",
  "Where is my money going?",
  "How's my Maal Score looking?",
  "Should I pay down debt or invest?",
];

/** Inline Ask Maal composer on the dashboard. Hands the question off to a new
 *  thread, which auto-sends it (via the maal_autosend_<id> handoff key). */
export function AskMaalTile() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const thread = (await createThread()) as { id: string };
      try { localStorage.setItem(`maal_autosend_${thread.id}`, t); } catch { /* ignore */ }
      navigate({ to: "/app/advisor/$threadId", params: { threadId: thread.id } });
    } catch {
      // Keep (or restore, for chip clicks) the entered question so the user can
      // retry without retyping.
      setQ(t);
      setErr("Couldn't start your chat — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mh-card" aria-labelledby="mh-ask-label">
      <div className="mh-card-head">
        <h2 id="mh-ask-label" className="mh-card-label m-0 font-normal">Ask Maal</h2>
        <div className="mh-card-actions"><Sparkles className="size-5" style={{ color: "var(--mh-spark)" }} aria-hidden /></div>
      </div>
      <div className="mh-card-body">
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="mh-ask-form">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask anything about your money…"
            aria-label="Ask Maal a question"
          />
          <button type="submit" disabled={busy || !q.trim()} aria-label="Ask" className="mh-btn-ink" style={{ height: 40, padding: "0 14px" }}>
            <ArrowRight className="size-4" />
          </button>
        </form>
        {err && (
          <p role="alert" className="mt-2 mb-0 mh-small" style={{ color: "var(--mh-bad)" }}>
            {err} Your question is still above, so just ask again.
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {CHIPS.map((c) => (
            <button key={c} onClick={() => ask(c)} disabled={busy} className="mh-chip-btn disabled:opacity-40">{c}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
