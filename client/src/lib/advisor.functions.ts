// Advisor — chats are stored server-side (routes/advisor-threads.js); the reply
// comes from /api/v1/advisor/stream, with /message as a compatibility fallback,
// after which the turn is persisted to the chat.
import type { WidgetSpec } from "@/lib/widgets.functions";
import { handleUnauthenticated } from "@/integrations/api";

export type Thread = { id: string; title: string; is_favourite: boolean; created_at?: string; updated_at: string };
export type Citation = { label: string };
export type FeedbackRating = "up" | "down" | null;
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  widgets?: WidgetSpec[];
  followUps?: string[];
  citations?: Citation[];
  rating?: FeedbackRating;
};

export const DEFAULT_THREAD_TITLE = "New chat";
const BASE = "/api/v1/advisor/threads";

// Callers pass the Lovable-style { data: { ... } } envelope — unwrap it, but
// also tolerate a flat object.
function unwrapArg<T>(payload: unknown): T {
  const p = payload as { data?: T } | undefined;
  return ((p && p.data !== undefined ? p.data : p) ?? {}) as T;
}

async function api<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong. Please try again."): Promise<T> {
  const r = await fetch(BASE + path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (r.status === 401) handleUnauthenticated();
  const json = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(json?.error || fallback), { status: r.status });
  return json as T;
}

// ─── One-time import of chats kept in localStorage before server storage ────
const LEGACY_THREADS_KEY = "maal_advisor_threads";
let importPromise: Promise<void> | null = null;

function importLegacyThreads(): Promise<void> {
  if (importPromise) return importPromise;
  importPromise = (async () => {
    let legacy: { id: string; title: string }[] = [];
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_THREADS_KEY) || "[]"); } catch { legacy = []; }
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    for (const lt of legacy.slice(0, 20)) {
      let msgs: Message[] = [];
      try { msgs = JSON.parse(localStorage.getItem(`maal_msgs_${lt.id}`) || "[]"); } catch { msgs = []; }
      const clean = msgs
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .slice(-60)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 4000),
          meta: m.role === "assistant" ? { followUps: m.followUps, citations: m.citations } : undefined,
        }));
      try {
        // One chat per request — the server's JSON body limit is 50kb.
        if (clean.length) await api("/import", { method: "POST", body: JSON.stringify({ threads: [{ title: lt.title, messages: clean }] }) });
        localStorage.removeItem(`maal_msgs_${lt.id}`);
      } catch { return; /* keep the rest for next time */ }
    }
    localStorage.removeItem(LEGACY_THREADS_KEY);
  })().catch(() => { /* never block the list on the import */ });
  return importPromise;
}

// ─── Threads ────────────────────────────────────────────────────────────────
export async function listThreads(): Promise<Thread[]> {
  await importLegacyThreads();
  const j = await api<{ threads: Thread[] }>("", {}, "Couldn't load your chats.");
  return j.threads ?? [];
}

export async function createThread(): Promise<Thread> {
  const j = await api<{ thread: Thread }>("", { method: "POST", body: "{}" }, "Couldn't start a new chat.");
  return j.thread;
}

export async function renameThread(id: string, title: string): Promise<Thread> {
  const j = await api<{ thread: Thread }>(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) }, "Couldn't rename that chat.");
  return j.thread;
}

export async function setThreadFavourite(id: string, isFavourite: boolean): Promise<Thread> {
  const j = await api<{ thread: Thread }>(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ is_favourite: isFavourite }) }, "Couldn't update favourites.");
  return j.thread;
}

export async function deleteThread(data?: unknown): Promise<void> {
  const { id, threadId } = unwrapArg<{ id?: string; threadId?: string }>(data);
  const tid = id || threadId;
  if (!tid) return;
  await api(`/${encodeURIComponent(tid)}`, { method: "DELETE" }, "Couldn't delete that chat.");
  try { localStorage.removeItem(`maal_draft_${tid}`); } catch { /* ignore */ }
}

export async function getThreadMessages(data?: unknown): Promise<Message[]> {
  const { threadId } = unwrapArg<{ threadId?: string }>(data);
  if (!threadId) return [];
  const j = await api<{ thread: Thread; messages: Message[] }>(`/${encodeURIComponent(threadId)}`, {}, "Couldn't load this chat.");
  return j.messages ?? [];
}

export async function saveMessageFeedback(threadId: string, messageId: string, rating: FeedbackRating): Promise<FeedbackRating> {
  const path = `/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/feedback`;
  const j = await api<{ rating: FeedbackRating }>(path, { method: "POST", body: JSON.stringify({ rating }) }, "Couldn't save feedback.");
  return j.rating;
}

// ─── Send ───────────────────────────────────────────────────────────────────
export type AdvisorReply = {
  reply: string;
  widgets?: WidgetSpec[];
  followUps?: string[];
  citations?: Citation[];
  aborted?: boolean;
  /** true when the reply is a usage-limit upgrade prompt (402), not an answer */
  limited?: boolean;
  thread?: Thread;
  messageId?: string;
};

export const ADVISOR_STAGES = ["retrieving_data", "checking_constants", "drafting", "verifying", "revising"] as const;
export type AdvisorStage = (typeof ADVISOR_STAGES)[number];
type AdvisorProgress = { stage: AdvisorStage; phase: "start" | "end" };
type AdvisorAnswer = Pick<AdvisorReply, "reply" | "widgets" | "followUps" | "citations">;

async function readAdvisorStream(response: Response, onProgress?: (progress: AdvisorProgress) => void): Promise<AdvisorAnswer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Advisor stream unavailable");
  const decoder = new TextDecoder();
  let buffer = "";
  let answer: AdvisorAnswer | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Advisor stream ended before the answer was complete");
      buffer += decoder.decode(value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const lines = buffer.slice(0, separator.index).split(/\r?\n/);
        buffer = buffer.slice(separator.index + separator[0].length);
        const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        if (event === "error") throw new Error("Advisor stream failed");
        if (event === "done" && answer) return answer;
        if (event !== "step" && event !== "final") continue;
        const payload = JSON.parse(lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n"));
        if (event === "final" && typeof payload?.reply === "string") answer = payload;
        if (event === "step" && ADVISOR_STAGES.includes(payload?.stage) && (payload.phase === "start" || payload.phase === "end")) {
          onProgress?.({ stage: payload.stage, phase: payload.phase });
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function sendAdvisorMessage(
  data?: unknown,
  opts?: { signal?: AbortSignal; history?: { role: string; content: string }[]; onProgress?: (progress: AdvisorProgress) => void },
): Promise<AdvisorReply> {
  const { threadId, content } = unwrapArg<{ threadId?: string; content?: string }>(data);
  if (!threadId || !content) return { reply: "" };

  let history = opts?.history;
  if (!history) {
    try { history = (await getThreadMessages({ threadId })).map((m) => ({ role: m.role, content: m.content })); }
    catch { history = []; }
  }

  try {
    const request: RequestInit = {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, history: history.slice(-10) }),
      signal: opts?.signal,
    };
    let response = await fetch("/api/v1/advisor/stream", request);
    const legacy = [404, 405, 501].includes(response.status);
    if (legacy) {
      await response.body?.cancel().catch(() => undefined);
      response = await fetch("/api/v1/advisor/message", request);
    }
    if (response.status === 401) handleUnauthenticated();

    let answer: AdvisorAnswer;
    let limited = false;
    if (response.ok && response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
      answer = await readAdvisorStream(response, opts?.onProgress);
    } else {
      const json = await response.json().catch(() => null);
      limited = response.status === 402 && json?.code === "usage_limit";
      if (limited) {
        answer = { reply: `${json.error || "You’ve reached your advisor message limit."} You can upgrade at Plan & Usage in the sidebar.` };
      } else if (legacy && response.ok && typeof json?.reply === "string") {
        answer = json;
      } else {
        throw new Error("Advisor reply unavailable");
      }
    }

    opts?.signal?.throwIfAborted();
    const { reply, widgets, followUps, citations } = answer;
    const toStore: { role: "user" | "assistant"; content: string; meta?: unknown }[] = [{ role: "user", content }];
    if (!limited) toStore.push({ role: "assistant", content: reply, meta: { widgets, followUps, citations } });
    const saved = await persistTurn(threadId, toStore).catch(() => undefined);
    return { reply, widgets, followUps, citations, limited, thread: saved?.thread, messageId: saved?.messageIds?.[1] };
  } catch (error) {
    if (opts?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) return { reply: "", aborted: true };
    return { reply: "The advisor couldn’t finish your answer. Please try again." };
  }
}

async function persistTurn(threadId: string, messages: { role: "user" | "assistant"; content: string; meta?: unknown }[]) {
  return api<{ thread: Thread; messageIds?: string[] }>(`/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: JSON.stringify({ messages }) });
}
