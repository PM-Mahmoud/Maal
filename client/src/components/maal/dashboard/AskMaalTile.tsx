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
    <div className="rounded-[14px] border border-border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-mint" />
        <h2 className="text-[14px] font-bold tracking-display">Ask Maal</h2>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="flex gap-2 border border-border rounded-[10px] bg-background p-1.5"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your money…"
          aria-label="Ask Maal a question"
          className="flex-1 bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
        />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Ask"
          className="bg-foreground text-background px-3 rounded-[7px] disabled:opacity-40 inline-flex items-center">
          <ArrowRight className="size-4" />
        </button>
      </form>
      {err && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--gold)]">
          {err} Your question is still above — hit ask again to retry.
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => ask(c)} disabled={busy}
            className="text-[11.5px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-40 transition-colors">
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
