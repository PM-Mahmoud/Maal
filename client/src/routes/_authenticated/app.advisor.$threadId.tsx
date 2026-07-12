import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { Plus, Check, Brain, Download, Mic, Square } from "lucide-react";
import { getThreadMessages, sendAdvisorMessage } from "@/lib/advisor.functions";
import { addWidget, type WidgetSpec } from "@/lib/widgets.functions";
import { WidgetRenderer } from "@/components/maal/WidgetRenderer";
import { MemoryPanel } from "@/components/maal/advisor/MemoryPanel";
import { Disclaimer } from "@/components/maal/Disclaimer";

export const Route = createFileRoute("/_authenticated/app/advisor/$threadId")({
  component: ThreadPage,
});

type Citation = { label: string };
type Msg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  widgets?: WidgetSpec[];
  followUps?: string[];
  citations?: Citation[];
};

function AddToDashboard({ widget }: { widget: WidgetSpec }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        if (added || busy) return;
        setBusy(true);
        const ok = await addWidget(widget.source, widget.title);
        setBusy(false);
        if (ok) setAdded(true);
      }}
      disabled={added}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-[7px] border border-border hover:border-foreground/40 disabled:opacity-70 transition-colors"
    >
      {added ? <><Check className="size-3" /> Added</> : <><Plus className="size-3" /> Add to Dashboard</>}
    </button>
  );
}

const SUGGESTIONS = [
  "Am I on track to retire?",
  "How do I pay off debt faster?",
  "Is my emergency fund big enough?",
  "Should I pay down my mortgage or invest more into super?",
];

const DRAFT_KEY = (id: string) => `maal_draft_${id}`;

function ThreadPage() {
  const { threadId } = Route.useParams();
  const load = getThreadMessages;
  const send = sendAdvisorMessage;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    setMessages([]); setError(null);
    autoSentRef.current = false;
    // Restore any autosaved draft for this thread.
    try { setInput(localStorage.getItem(DRAFT_KEY(threadId)) || ""); } catch { /* ignore */ }
    load({ data: { threadId } }).then((rows) => {
      setMessages(rows as Msg[]);
      // Handoff from the dashboard "Ask Maal" tile: auto-send the pending
      // question into this fresh thread, exactly once.
      let pending = "";
      try { pending = localStorage.getItem(`maal_autosend_${threadId}`) || ""; } catch { /* ignore */ }
      if (pending && (rows as Msg[]).length === 0 && !autoSentRef.current) {
        autoSentRef.current = true;
        try { localStorage.removeItem(`maal_autosend_${threadId}`); } catch { /* ignore */ }
        submit(pending);
        return;
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, load]);

  // Draft autosave — persist the composer text so a refresh/redirect doesn't lose it.
  function onInput(v: string) {
    setInput(v);
    try { if (v) localStorage.setItem(DRAFT_KEY(threadId), v); else localStorage.removeItem(DRAFT_KEY(threadId)); } catch { /* ignore */ }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setError(null); setInput("");
    try { localStorage.removeItem(DRAFT_KEY(threadId)); } catch { /* ignore */ }
    setMessages((m) => [...m, { role: "user", content: t }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    try {
      const { reply, widgets, followUps, citations, aborted } = await send({ data: { threadId, content: t } }, { signal: controller.signal });
      if (aborted) {
        setMessages((m) => [...m, { role: "assistant", content: "_(stopped)_" }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: reply, widgets, followUps, citations }]);
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function download() {
    const lines = messages.map((m) => (m.role === "user" ? "You" : "Maal") + ":\n" + m.content).join("\n\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ask-maal-${threadId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Voice input isn't supported in this browser."); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-AU"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const text = ev.results?.[0]?.[0]?.transcript ?? "";
      if (text) onInput((input ? input + " " : "") + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  const voiceSupported = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 flex flex-col h-[calc(100vh-3px)]">
      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}
      <div className="flex items-center justify-between mb-4">
        <Link to="/app/advisor" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
          ← All conversations
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowMemory(true)} title="Memory & instructions"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-[7px] hover:bg-[var(--secondary)]">
            <Brain className="size-3.5" /> Memory
          </button>
          {messages.length > 0 && (
            <button onClick={download} title="Download conversation" aria-label="Download conversation"
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-[7px] hover:bg-[var(--secondary)]">
              <Download className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.length === 0 && !busy && (
          <div>
            <h1 className="text-[24px] tracking-display font-bold mb-1">Ask your CFO</h1>
            <p className="text-[13px] text-muted-foreground mb-5">Plain-English answers grounded in your snapshot.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)}
                  className="text-left p-4 border border-border rounded-[10px] bg-[var(--surface)] hover:border-foreground/40 text-[13px]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] px-4 py-3 rounded-[12px] text-[13.5px] leading-relaxed whitespace-pre-wrap bg-foreground text-background">
                {m.content}
              </div>
            ) : (
              <div className="max-w-[90%] w-full">
                <div className="text-[14px] leading-relaxed whitespace-pre-wrap text-foreground">{m.content}</div>
                {m.widgets?.map((w, wi) => (
                  <WidgetRenderer key={wi} widget={w} action={<AddToDashboard widget={w} />} />
                ))}
                {m.citations && m.citations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Based on</span>
                    {m.citations.map((c, ci) => (
                      <span key={ci} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--secondary)] text-muted-foreground">{c.label}</span>
                    ))}
                  </div>
                )}
                {m.followUps && m.followUps.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {m.followUps.map((q, qi) => (
                      <button key={qi} onClick={() => submit(q)} disabled={busy}
                        className="text-left text-[12px] px-3 py-1.5 rounded-full border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-[12px] text-muted-foreground animate-pulse">Thinking…</p>}
        {error && <p className="text-[12px] text-[var(--gold)]">{error}</p>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="flex gap-2 border border-border rounded-[12px] bg-[var(--surface)] p-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="Ask anything about your money…"
          aria-label="Ask Maal a question about your money"
          className="flex-1 bg-transparent px-3 py-2 text-[14px] outline-none"
        />
        {voiceSupported && (
          <button type="button" onClick={toggleVoice} title="Voice input" aria-label="Voice input"
            className={`px-2.5 rounded-[8px] transition-colors ${listening ? "text-red-500 animate-pulse" : "text-muted-foreground hover:text-foreground"}`}>
            <Mic className="size-4" />
          </button>
        )}
        {busy ? (
          <button type="button" onClick={stop} aria-label="Stop"
            className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[12px] font-semibold inline-flex items-center gap-1.5">
            <Square className="size-3 fill-current" /> Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}
            className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[12px] font-semibold disabled:opacity-40">
            Send
          </button>
        )}
      </form>

      <div className="mt-3"><Disclaimer variant="inline" /></div>
    </div>
  );
}