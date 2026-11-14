// Advisor — chats are stored server-side (routes/advisor-threads.js); the reply
// itself comes from POST /api/v1/advisor/message (metering, guardrails, widgets),
// after which the turn is persisted to the chat.
import type { WidgetSpec } from "@/lib/widgets.functions";
import { handleUnauthenticated } from "@/integrations/api";

export type Thread = { id: string; title: string; is_favourite: boolean; created_at?: string; updated_at: string };
export type Citation = { label: string };
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  widgets?: WidgetSpec[];
  followUps?: string[];
  citations?: Citation[];
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
};

export async function sendAdvisorMessage(
  data?: unknown,
  opts?: { signal?: AbortSignal; history?: { role: string; content: string }[] },
): Promise<AdvisorReply> {
  const { threadId, content } = unwrapArg<{ threadId?: string; content?: string }>(data);
  if (!threadId || !content) return { reply: "" };

  let history = opts?.history;
  if (!history) {
    try { history = (await getThreadMessages({ threadId })).map((m) => ({ role: m.role, content: m.content })); }
    catch { history = []; }
  }

  let reply: string;
  let widgets: WidgetSpec[] | undefined;
  let followUps: string[] | undefined;
  let citations: Citation[] | undefined;
  let limited = false;
  try {
    const r = await fetch("/api/v1/advisor/message", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, history: history.slice(-10) }),
      signal: opts?.signal,
    });
    if (r.status === 401) handleUnauthenticated();
    const json = await r.json().catch(() => null);
    // 402 usage_limit carries an upgrade prompt in `error` — surface it as the
    // reply (an explanation with a path forward, never a raw error).
    limited = r.status === 402 && json?.code === "usage_limit";
    reply = r.ok
      ? (json?.reply ?? json?.message ?? "I'm not able to respond right now.")
      : (limited && json?.error
          ? `${json.error} You can upgrade at Plan & Usage in the sidebar.`
          : "I'm not able to respond right now.");
    widgets = r.ok && Array.isArray(json?.widgets) && json.widgets.length ? json.widgets : undefined;
    followUps = r.ok && Array.isArray(json?.followUps) && json.followUps.length ? json.followUps : undefined;
    citations = r.ok && Array.isArray(json?.citations) && json.citations.length ? json.citations : undefined;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      // Keep the question in the chat even when the answer was stopped.
      await persistTurn(threadId, [{ role: "user", content }]).catch(() => null);
      return { reply: "", aborted: true };
    }
    return { reply: "Unable to reach the advisor. Please check your connection and try again." };
  }

  // Persist the turn (the upgrade prompt isn't stored as an answer).
  const toStore: { role: "user" | "assistant"; content: string; meta?: unknown }[] = [{ role: "user", content }];
  if (!limited) toStore.push({ role: "assistant", content: reply, meta: { widgets, followUps, citations } });
  const thread = await persistTurn(threadId, toStore).catch(() => undefined);
  return { reply, widgets, followUps, citations, limited, thread };
}

async function persistTurn(threadId: string, messages: { role: "user" | "assistant"; content: string; meta?: unknown }[]): Promise<Thread> {
  const j = await api<{ thread: Thread }>(`/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: JSON.stringify({ messages }) });
  return j.thread;
}
