import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Check, ChevronDown, ChevronUp, Loader2, Mic, Plus, Sparkle, Square, ThumbsDown, ThumbsUp, X, CircleCheck } from "lucide-react";
import { ADVISOR_STAGES, getThreadMessages, saveMessageFeedback, sendAdvisorMessage, type AdvisorStage, type Citation, type FeedbackRating, type Thread } from "@/lib/advisor.functions";
import { addWidget, type WidgetSpec } from "@/lib/widgets.functions";
import { WidgetRenderer } from "@/components/maal/WidgetRenderer";
import { AdvisorMarkdown } from "./AdvisorMarkdown";

type Msg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  widgets?: WidgetSpec[];
  followUps?: string[];
  citations?: Citation[];
  rating?: FeedbackRating;
  stopped?: boolean;
  limited?: boolean;
};

// Australian, profit-based starters (never steer towards new interest-bearing products).
export const ADVISOR_SUGGESTIONS = [
  "Should I salary sacrifice into super?",
  "Offset account or extra repayments?",
  "How does the First Home Super Saver scheme work?",
  "How can I build wealth?",
];

const THINKING_STEPS: Record<AdvisorStage, { title: string; desc: string }> = {
  retrieving_data: { title: "Reviewing your financial snapshot", desc: "Gathering the financial data and background for your question." },
  checking_constants: { title: "Applying Australian rules", desc: "Preparing the current financial year’s rules and figures." },
  drafting: { title: "Drafting your answer", desc: "Considering your question alongside your financial snapshot." },
  verifying: { title: "Checking the numbers", desc: "Checking claims and calculations against the supplied figures." },
  revising: { title: "Revising your answer", desc: "Updating the answer based on those checks." },
};

type Progress = Partial<Record<AdvisorStage, "active" | "done">>;

const DRAFT_KEY = (id: string) => `maal_draft_${id}`;
const HINT_KEY = "maal_memory_hint_dismissed";

function AddToDashboard({ widget }: { widget: WidgetSpec }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (added || busy) return;
        setBusy(true);
        setFailed(false);
        try {
          const ok = await addWidget(widget.source, widget.title);
          if (ok) setAdded(true);
          else setFailed(true);
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
      disabled={added || busy}
      className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-[8px] border border-border hover:border-foreground/40 disabled:opacity-70 transition-colors"
    >
      {added
        ? <><Check className="size-3" /> Added</>
        : failed
          ? <><Plus className="size-3" /> Failed — retry</>
          : <><Plus className="size-3" /> Add to Dashboard</>}
    </button>
  );
}

function ThinkingCard({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState(false);
  const active = ADVISOR_STAGES.find((stage) => progress[stage] === "active");
  const visibleSteps = ADVISOR_STAGES.filter((stage) => progress[stage]);
  const label = active ? THINKING_STEPS[active].title : "Working on your answer";
  return (
    <div className="mx-adv-think" aria-live="polite">
      {visibleSteps.length === 0 ? (
        <div className="mx-adv-think-head">
          <span className="inline-flex items-center gap-2.5"><Loader2 className="size-4 mx-adv-spin" />{label}…</span>
        </div>
      ) : (
        <button type="button" className="mx-adv-think-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="inline-flex items-center gap-2.5">
            {!open && <Loader2 className="size-4 mx-adv-spin" style={{ color: "#7C6FE0" }} />}
            <span>{label}…</span>
          </span>
          {open ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </button>
      )}
      {open && (
        <ol className="mx-adv-think-steps">
          {visibleSteps.map((stage) => {
            const step = THINKING_STEPS[stage];
            const state = progress[stage];
            return (
              <li key={stage} className="mx-adv-step" data-state={state}>
                <span className="mx-adv-step-icon">
                  {state === "done" ? <CircleCheck className="size-4" /> : <Loader2 className="size-4 mx-adv-spin" />}
                </span>
                <span className="mx-adv-step-title">{step.title}</span>
                <span className="mx-adv-step-desc">{step.desc}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Feedback({ threadId, messageId, rating }: { threadId: string; messageId: string; rating?: FeedbackRating }) {
  const [vote, setVote] = useState(rating ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: "up" | "down") {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      setVote(await saveMessageFeedback(threadId, messageId, vote === next ? null : next));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-adv-answer-foot">
      <button type="button" className="mx-adv-fb" aria-label="Helpful" aria-pressed={vote === "up"} disabled={saving} onClick={() => save("up")}>
        <ThumbsUp className="size-4" fill={vote === "up" ? "currentColor" : "none"} />
      </button>
      <button type="button" className="mx-adv-fb" aria-label="Not helpful" aria-pressed={vote === "down"} disabled={saving} onClick={() => save("down")}
        style={vote === "down" ? { color: "var(--a-ink)" } : undefined}>
        <ThumbsDown className="size-4" fill={vote === "down" ? "currentColor" : "none"} />
      </button>
      {error && <span className="mx-adv-error" role="status">Couldn't save feedback. Try again.</span>}
    </div>
  );
}

export function WelcomeState({ onPick, disabled, compact }: { onPick: (q: string) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className="mx-adv-welcome" style={compact ? { minHeight: 0, padding: "20px 8px" } : undefined}>
      <Sparkle className="size-6 mx-adv-sparkle" fill="currentColor" aria-hidden="true" />
      <h2 className="mx-adv-welcome-title">
        Your Maal <em>money advisor</em><br />is ready to help you.
      </h2>
      <div className="mx-adv-chips">
        {ADVISOR_SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="mx-adv-chip" onClick={() => onPick(s)} disabled={disabled}>{s}</button>
        ))}
      </div>
    </div>
  );
}

export function MemoryHint({ onOpenMemory }: { onOpenMemory: () => void }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; }
  });
  if (hidden) return null;
  return (
    <div className="mx-adv-hint">
      <span>
        Maal remembers what matters from your chats.{" "}
        <button type="button" className="mx-adv-linkish" onClick={onOpenMemory}>Review your financial memory</button>
      </span>
      <button type="button" className="mx-adv-icon-btn" style={{ width: 28, height: 28 }} aria-label="Dismiss tip"
        onClick={() => { setHidden(true); try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ } }}>
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Composer({
  value, onChange, onSubmit, busy, onStop, inputRef, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  onStop?: () => void;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? localRef;
  const voiceSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => () => recognitionRef.current?.stop?.(), []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value, ref]);

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceError("Voice input isn't supported in this browser."); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    setVoiceError(null);
    const rec = new SR();
    rec.lang = "en-AU"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const text = ev.results?.[0]?.[0]?.transcript ?? "";
      if (text) onChange((value ? value + " " : "") + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <>
      <form className="mx-adv-composer" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); }
          }}
          placeholder="Ask anything…"
          aria-label="Ask Maal a question about your money"
        />
        {voiceSupported && (
          <button type="button" className="mx-adv-icon-btn mx-adv-mic" data-on={listening} onClick={toggleVoice}
            aria-label={listening ? "Stop voice input" : "Voice input"} title="Voice input">
            <Mic className="size-[18px]" />
          </button>
        )}
        {busy && onStop ? (
          <button type="button" className="mx-adv-send" onClick={onStop} aria-label="Stop generating">
            <Square className="size-3.5" fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="mx-adv-send" disabled={!value.trim() || busy} aria-label="Send message">
            <ArrowUp className="size-5" />
          </button>
        )}
      </form>
      {voiceError && <p className="mx-adv-error" style={{ marginTop: 6 }}>{voiceError}</p>}
    </>
  );
}

/**
 * One chat: messages (text, widgets, citations, follow-ups, feedback), the
 * thinking state, and the composer. Keep keyed by threadId.
 */
export function ChatConversation({
  threadId, onTurnSaved, onOpenMemory, downloadRef, onHasMessages,
}: {
  threadId: string;
  onTurnSaved?: (thread?: Thread) => void;
  onOpenMemory: () => void;
  downloadRef?: MutableRefObject<(() => void) | null>;
  onHasMessages?: (has: boolean) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  // Generation counter — bumped whenever the thread changes so late responses
  // from a previous thread's load/send are discarded.
  const genRef = useRef(0);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  useEffect(() => { onHasMessages?.(messages.length > 0); }, [messages.length, onHasMessages]);

  useEffect(() => {
    const gen = ++genRef.current;
    setMessages([]); setError(null); setLoaded(false);
    autoSentRef.current = false;
    try { setInput(localStorage.getItem(DRAFT_KEY(threadId)) || ""); } catch { /* ignore */ }
    getThreadMessages({ data: { threadId } }).then((rows) => {
      if (genRef.current !== gen) return;
      setMessages(rows as Msg[]);
      setLoaded(true);
      // Handoff from "Ask Maal" entry points: auto-send the pending question once.
      let pending = "";
      try { pending = localStorage.getItem(`maal_autosend_${threadId}`) || ""; } catch { /* ignore */ }
      if (pending && rows.length === 0 && !autoSentRef.current) {
        autoSentRef.current = true;
        try { localStorage.removeItem(`maal_autosend_${threadId}`); } catch { /* ignore */ }
        submit(pending);
        return;
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      });
    }).catch((e: any) => {
      if (genRef.current !== gen) return;
      setLoaded(true);
      setError(e?.status === 404 ? "This chat no longer exists." : "Couldn't load this chat. Please try again.");
    });
    return () => {
      genRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  function onInput(v: string) {
    setInput(v);
    try { if (v) localStorage.setItem(DRAFT_KEY(threadId), v); else localStorage.removeItem(DRAFT_KEY(threadId)); } catch { /* ignore */ }
  }

  async function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const gen = genRef.current;
    const history = messagesRef.current
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m.stopped && !m.limited)
      .map((m) => ({ role: m.role, content: m.content }));
    setError(null); setInput("");
    try { localStorage.removeItem(DRAFT_KEY(threadId)); } catch { /* ignore */ }
    setMessages((m) => [...m, { role: "user", content: t }]);
    setProgress({});
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    scrollToEnd();
    try {
      const res = await sendAdvisorMessage({ data: { threadId, content: t } }, {
        signal: controller.signal,
        history,
        onProgress: ({ stage, phase }) => {
          if (genRef.current === gen && !controller.signal.aborted) {
            setProgress((steps) => ({ ...steps, [stage]: phase === "start" ? "active" : "done" }));
          }
        },
      });
      if (genRef.current !== gen) return;
      if (res.aborted) {
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: "Stopped.", stopped: true }]);
        onInput(t);
      } else {
        setMessages((m) => [...m, {
          id: res.messageId, role: "assistant", content: res.reply, widgets: res.widgets, followUps: res.followUps, citations: res.citations, limited: res.limited,
        }]);
      }
      onTurnSaved?.(res.thread);
      scrollToEnd();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e: any) {
      if (genRef.current === gen) setError(e?.message ?? "Something went wrong.");
    } finally {
      if (genRef.current === gen) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  }

  function download() {
    const lines = messagesRef.current.map((m) => (m.role === "user" ? "You" : "Maal") + ":\n" + m.content).join("\n\n");
    const blob = new Blob([lines + "\n\n---\nMaal does not provide financial advice. Any information provided by Maal is for educational purposes only.\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `maal-chat-${threadId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (downloadRef) downloadRef.current = messages.length ? download : null;

  const lastAssistant = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i; return -1; })();

  return (
    <div className="mx-adv-main">
      <div ref={scrollRef} className="mx-adv-scroll">
        {loaded && messages.length === 0 && !busy && !error && (
          <WelcomeState onPick={(q) => submit(q)} disabled={busy} />
        )}
        <div className="mx-adv-thread">
          {messages.map((m, i) => (
            m.role === "user" ? (
              <div key={m.id ?? `u${i}`} className="mx-adv-user-row"><div className="mx-adv-user">{m.content}</div></div>
            ) : (
              <div key={m.id ?? `a${i}`} className="mx-adv-answer">
                {m.stopped ? <p className="mx-adv-stopped">Stopped — ask again whenever you're ready.</p> : <AdvisorMarkdown text={m.content} />}
                {m.limited && (
                  <Link to="/app/billing" className="mx-adv-btn" style={{ display: "inline-flex", alignItems: "center", marginTop: 14, height: 44, fontSize: 14 }}>
                    See plans
                  </Link>
                )}
                {m.widgets?.map((w, wi) => (
                  <div key={wi} className="mx-adv-widget">
                    <WidgetRenderer widget={w} action={w.canSave !== false ? <AddToDashboard widget={w} /> : undefined} />
                  </div>
                ))}
                {m.citations && m.citations.length > 0 && (
                  <div className="mx-adv-cites">
                    <span className="mx-adv-kicker" style={{ fontSize: 10 }}>Based on</span>
                    {m.citations.map((c, ci) => <span key={ci} className="mx-adv-cite">{c.label}</span>)}
                  </div>
                )}
                {i === lastAssistant && m.followUps && m.followUps.length > 0 && (
                  <div className="mx-adv-chips mx-adv-followups">
                    {m.followUps.map((q, qi) => (
                      <button key={qi} type="button" className="mx-adv-chip" onClick={() => submit(q)} disabled={busy}>{q}</button>
                    ))}
                  </div>
                )}
                {m.role === "assistant" && m.id && !m.stopped && !m.limited && <Feedback threadId={threadId} messageId={m.id} rating={m.rating} />}
              </div>
            )
          ))}
          {busy && <ThinkingCard progress={progress} />}
          {!loaded && !error && <p className="mx-adv-stopped" style={{ fontStyle: "normal" }}>Loading chat…</p>}
          {error && <p className="mx-adv-error" role="alert">{error}</p>}
        </div>
      </div>
      <div style={{ maxWidth: 980, width: "100%", margin: "0 auto" }}>
        {messages.length === 0 && <MemoryHint onOpenMemory={onOpenMemory} />}
        <Composer value={input} onChange={onInput} onSubmit={() => submit(input)} busy={busy} onStop={() => abortRef.current?.abort()} inputRef={inputRef} />
        <p className="mx-adv-foot-note">
          Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.
        </p>
      </div>
    </div>
  );
}
