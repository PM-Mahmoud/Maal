import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { getThreadMessages, sendAdvisorMessage } from "@/lib/advisor.functions";
import { Disclaimer } from "@/components/maal/Disclaimer";

export const Route = createFileRoute("/_authenticated/app/advisor/$threadId")({
  component: ThreadPage,
});

type Msg = { id?: string; role: "user" | "assistant" | "system"; content: string };

const SUGGESTIONS = [
  "Am I on track to retire?",
  "How do I pay off debt faster?",
  "Is my emergency fund big enough?",
  "Should I pay down my mortgage or invest more into super?",
];

function ThreadPage() {
  const { threadId } = Route.useParams();
  const load = getThreadMessages;
  const send = sendAdvisorMessage;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([]); setError(null);
    load({ data: { threadId } }).then((rows) => {
      setMessages(rows as Msg[]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      });
    });
  }, [threadId, load]);

  async function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setError(null); setInput("");
    setMessages((m) => [...m, { role: "user", content: t }]);
    setBusy(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    try {
      const { reply } = await send({ data: { threadId, content: t } });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 flex flex-col h-[calc(100vh-3px)]">
      <div className="flex items-center justify-between mb-4">
        <Link to="/app/advisor" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
          ← All conversations
        </Link>
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
              <div className="max-w-[90%] text-[14px] leading-relaxed whitespace-pre-wrap text-foreground">
                {m.content}
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
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your money…"
          aria-label="Ask Maal a question about your money"
          className="flex-1 bg-transparent px-3 py-2 text-[14px] outline-none"
        />
        <button type="submit" disabled={busy || !input.trim()}
          className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[12px] font-semibold disabled:opacity-40">
          Send
        </button>
      </form>

      <div className="mt-3"><Disclaimer variant="inline" /></div>
    </div>
  );
}