// Advisor — thread management in localStorage, messages proxy to Express
import type { WidgetSpec } from "@/lib/widgets.functions";

const THREADS_KEY = "maal_advisor_threads";

type Thread = { id: string; title: string; updated_at: string };
type Citation = { label: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  widgets?: WidgetSpec[];
  followUps?: string[];
  citations?: Citation[];
};

function loadThreads(): Thread[] {
  try { return JSON.parse(localStorage.getItem(THREADS_KEY) || "[]"); } catch { return []; }
}
function saveThreads(threads: Thread[]) {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
}

// A conversation is "empty" until it has at least one stored message.
function hasMessages(id: string): boolean {
  try { return (JSON.parse(localStorage.getItem(`maal_msgs_${id}`) || "[]") as unknown[]).length > 0; }
  catch { return false; }
}

export async function listThreads(): Promise<Thread[]> {
  return loadThreads();
}

export async function createThread(): Promise<Thread> {
  // Drop any prior empty conversations so the list doesn't fill with untitled
  // "New conversation" duplicates from repeated clicks.
  const kept = loadThreads().filter((t) => hasMessages(t.id));
  const t: Thread = { id: crypto.randomUUID(), title: "New conversation", updated_at: new Date().toISOString() };
  kept.unshift(t);
  saveThreads(kept);
  return t;
}

// Callers pass the Lovable-style { data: { ... } } envelope — unwrap it. Reading
// the top level left threadId/content undefined, so getThreadMessages returned []
// and sendAdvisorMessage returned an empty reply (Ask Maal appeared "stuck").
// Also tolerates a flat object (internal calls pass { threadId } directly).
function unwrapArg<T>(payload: unknown): T {
  const p = payload as { data?: T } | undefined;
  return ((p && p.data !== undefined ? p.data : p) ?? {}) as T;
}

export async function deleteThread(data?: unknown): Promise<void> {
  const { id } = unwrapArg<{ id?: string }>(data);
  if (!id) return;
  saveThreads(loadThreads().filter(t => t.id !== id));
  localStorage.removeItem(`maal_msgs_${id}`);
}

export async function getThreadMessages(data?: unknown): Promise<Message[]> {
  const { threadId } = unwrapArg<{ threadId?: string }>(data);
  if (!threadId) return [];
  try { return JSON.parse(localStorage.getItem(`maal_msgs_${threadId}`) || "[]"); } catch { return []; }
}

type AdvisorReply = { reply: string; widgets?: WidgetSpec[]; followUps?: string[]; citations?: Citation[]; aborted?: boolean };

export async function sendAdvisorMessage(data?: unknown, opts?: { signal?: AbortSignal }): Promise<AdvisorReply> {
  const { threadId, content } = unwrapArg<{ threadId?: string; content?: string }>(data);
  if (!threadId || !content) return { reply: "" };

  // Save user message locally
  const msgs: Message[] = await getThreadMessages({ threadId });
  msgs.push({ id: crypto.randomUUID(), role: "user", content, created_at: new Date().toISOString() });
  localStorage.setItem(`maal_msgs_${threadId}`, JSON.stringify(msgs));

  // Update thread title on first message
  const threads = loadThreads();
  const t = threads.find(x => x.id === threadId);
  if (t && t.title === "New conversation") {
    t.title = content.slice(0, 50);
    t.updated_at = new Date().toISOString();
    saveThreads(threads);
  }

  // Proxy to existing Express advisor endpoint
  try {
    const r = await fetch("/api/v1/advisor/message", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, history: msgs.slice(-10).map(m => ({ role: m.role, content: m.content })) }),
      signal: opts?.signal,
    });
    const json = await r.json().catch(() => null);
    // 402 usage_limit carries an upgrade prompt in `error` — surface it as the
    // reply (an explanation with a path forward, never a raw error).
    const reply = r.ok
      ? (json?.reply ?? json?.message ?? "I'm not able to respond right now.")
      : (json?.code === "usage_limit" && json?.error
          ? `${json.error} You can upgrade at Plan & Usage in the sidebar.`
          : "I'm not able to respond right now.");

    const widgets: WidgetSpec[] | undefined = r.ok && Array.isArray(json?.widgets) && json.widgets.length ? json.widgets : undefined;
    const followUps: string[] | undefined = r.ok && Array.isArray(json?.followUps) && json.followUps.length ? json.followUps : undefined;
    const citations: Citation[] | undefined = r.ok && Array.isArray(json?.citations) && json.citations.length ? json.citations : undefined;

    msgs.push({ id: crypto.randomUUID(), role: "assistant", content: reply, created_at: new Date().toISOString(), widgets, followUps, citations });
    localStorage.setItem(`maal_msgs_${threadId}`, JSON.stringify(msgs));
    return { reply, widgets, followUps, citations };
  } catch (e: any) {
    if (e?.name === "AbortError") return { reply: "", aborted: true };
    return { reply: "Unable to reach advisor. Please try again." };
  }
}
