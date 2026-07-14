import { createFileRoute } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowLeft, Trash2, Download } from "lucide-react";
import { startResearch, pollResearch, listResearch, deleteResearch, downloadResearchPdf } from "@/lib/research.functions";

export const Route = createFileRoute("/_authenticated/app/research")({ component: ResearchPage });

type Report = { id: string; topic: string; body: any; created_at: string };

// User-facing labels for each pipeline phase (Plan→Gather→Compute→Write→Verify→Render).
const PHASE_LABEL: Record<string, string> = {
  plan: "Planning the research…",
  gather: "Gathering market data & sources…",
  compute: "Running the numbers (risk, volatility, Monte-Carlo)…",
  write: "Writing your report…",
  verify: "Fact-checking against Australian rules…",
  render: "Finishing up…",
  done: "Done",
};
const PHASE_ORDER = ["plan", "gather", "compute", "write", "verify", "render"];

const PROMPTS = [
  "What if the ASX drops 20% next quarter — how exposed am I?",
  "Compare salary sacrifice vs extra mortgage repayments for me",
  "What's the latest news affecting Australian bank shares?",
  "Project my net worth if I save an extra $500/month",
  "How would a 1% HECS indexation change affect my balance?",
  "What are my biggest financial risks right now?",
];

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long" });
}

function ResearchPage() {
  const list = listResearch;
  const rm = deleteResearch;

  const [reports, setReports] = useState<Report[]>([]);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [active, setActive] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<number | null>(null);

  async function refresh() {
    const r = (await list()) as Report[];
    setReports(r);
  }
  useEffect(() => {
    refresh();
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, []);

  async function runResearch(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setErr(null);
    setPhase("plan");
    try {
      const { jobId } = await startResearch({ data: { topic: q.trim() } });
      setTopic("");
      // Poll until the job completes or errors. Research is quick; poll ~2s.
      const tick = async () => {
        try {
          const s = await pollResearch(jobId);
          setPhase(s.phase);
          if (s.status === "complete" && s.report) {
            setActive(s.report as Report);
            setLoading(false);
            setPhase(null);
            await refresh();
            return;
          }
          if (s.status === "error") {
            setErr(s.error || "The research engine hit a snag — please try again.");
            setLoading(false);
            setPhase(null);
            return;
          }
          pollRef.current = window.setTimeout(tick, 2000);
        } catch (e: any) {
          setErr(e?.message ?? "Failed");
          setLoading(false);
          setPhase(null);
        }
      };
      pollRef.current = window.setTimeout(tick, 1500);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      setLoading(false);
      setPhase(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runResearch(topic);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runResearch(topic);
    }
  }

  // -------- Viewing a saved report --------------------------------------
  if (active) {
    return (
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <button
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Research
        </button>
        <article className="p-8 md:p-10 border border-border rounded-[16px] bg-[var(--surface)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Research · {formatDay(active.created_at)}
          </p>
          <h1 className="text-[28px] md:text-[32px] tracking-display font-bold leading-tight mb-3">
            {active.body?.title ?? active.topic}
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-8">
            {active.body?.summary}
          </p>
          {(active.body?.sections ?? []).map((s: any, i: number) => (
            <section key={i} className="mb-6">
              <h2 className="text-[16px] font-bold mb-2">{s.heading}</h2>
              <p className="text-[13.5px] leading-7 text-foreground/90 whitespace-pre-wrap">{s.body}</p>
            </section>
          ))}
          {active.body?.key_facts?.length > 0 && (
            <section className="mb-6">
              <h2 className="text-[16px] font-bold mb-2">Key facts</h2>
              <ul className="text-[13.5px] space-y-1.5 list-disc pl-5">
                {active.body.key_facts.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </section>
          )}
          {active.body?.risks?.length > 0 && (
            <section className="mb-6">
              <h2 className="text-[16px] font-bold mb-2">Risks</h2>
              <ul className="text-[13.5px] space-y-1.5 list-disc pl-5">
                {active.body.risks.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </section>
          )}
          {active.body?.considerations && (
            <section className="mb-6">
              <h2 className="text-[16px] font-bold mb-2">Other considerations</h2>
              <p className="text-[13.5px] leading-7">{active.body.considerations}</p>
            </section>
          )}
          <div className="pt-4 mt-6 border-t border-border flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Education only — not personal financial advice.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => downloadResearchPdf(active.id).catch((e) => setErr(e?.message ?? "PDF failed"))}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground hover:text-mint"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
              <button
                onClick={async () => {
                  await rm({ data: { id: active.id } });
                  setActive(null);
                  refresh();
                }}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-3 h-3" /> Delete report
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  // -------- Landing / composer view -------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
      <header className="mb-8">
        <h1 className="text-[32px] md:text-[36px] tracking-display font-bold leading-tight">Research</h1>
        <p className="mt-2 text-[14px] text-muted-foreground max-w-2xl">
          Ask anything. Maal grounds the answer in live market data and web research, then explains it.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-4 mb-10">
        {/* Composer */}
        <form
          onSubmit={onSubmit}
          className="lg:col-span-2 relative p-5 md:p-6 border border-border rounded-[14px] bg-[var(--surface)] focus-within:border-foreground/40 transition-colors"
        >
          <textarea
            ref={taRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            disabled={loading}
            placeholder="What happens to my borrowing power if the RBA cuts rates 0.5%?"
            className="w-full bg-transparent text-[14px] leading-relaxed placeholder:text-muted-foreground/60 resize-none focus:outline-none disabled:opacity-60"
            aria-label="Ask Maal Research"
          />
          <div className="flex items-end justify-between mt-6">
            {loading && phase ? (
              <p className="text-[11px] text-mint flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
                {PHASE_LABEL[phase] ?? "Working…"}
                <span className="text-muted-foreground">
                  ({Math.min(PHASE_ORDER.indexOf(phase) + 1, PHASE_ORDER.length)}/{PHASE_ORDER.length})
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Grounded in live data · education only</p>
            )}
            <button
              type="submit"
              disabled={loading || !topic.trim()}
              aria-label="Submit research question"
              className="w-9 h-9 rounded-full bg-[var(--mint)] text-[#0E0E10] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              )}
            </button>
          </div>
          {err && <p className="absolute left-6 -bottom-6 text-[11px] text-[var(--gold)]">{err}</p>}
        </form>

        {/* History */}
        <aside className="p-5 md:p-6 border border-border rounded-[14px] bg-[var(--surface)] min-h-[180px]">
          <p className="text-[12px] font-semibold mb-3">Research history</p>
          {reports.length === 0 ? (
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Your past research reports will appear here.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {reports.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setActive(r)}
                    className="w-full text-left flex items-start justify-between gap-3 py-2 group focus:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate group-hover:underline underline-offset-4">
                        {r.body?.title ?? r.topic}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatDay(r.created_at)}</p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--mint)]/15 text-[var(--mint)]">
                      complete
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <p className="text-center text-[12px] text-muted-foreground mb-4">Try research like…</p>
      <div className="grid md:grid-cols-2 gap-2 mb-10">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setTopic(p);
              taRef.current?.focus();
            }}
            disabled={loading}
            className="text-left px-4 py-3 border border-border rounded-[10px] bg-[var(--surface)] text-[12.5px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
          >
            {p}
          </button>
        ))}
      </div>

      <section className="relative p-6 md:p-8 rounded-[14px] surface-forest text-white overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-[10px] bg-white/10 backdrop-blur flex items-center justify-center font-bold text-[15px]">
            M
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold mb-1.5">How Research works</h2>
            <p className="text-[13px] leading-relaxed text-white/80">
              Ask a question and Maal pulls live market data and recent news, reads them against your profile, and writes a grounded report with sources — in seconds. Education only, never personal advice.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-10 pt-6 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          <span className="font-semibold uppercase tracking-[0.1em]">Disclaimer:</span> Maal does not provide
          financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.
        </p>
      </div>
    </div>
  );
}