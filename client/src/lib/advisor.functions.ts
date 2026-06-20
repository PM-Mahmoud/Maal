// Advisor — thread management in localStorage, messages proxy to Express
const THREADS_KEY = "maal_advisor_threads";

type Thread = { id: string; title: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string };

function loadThreads(): Thread[] {
  try { return JSON.parse(localStorage.getItem(THREADS_KEY) || "[]"); } catch { return []; }
}
function saveThreads(threads: Thread[]) {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
}

export async function listThreads(): Promise<Thread[]> {
  return loadThreads();
}

export async function createThread(): Promise<Thread> {
  const t: Thread = { id: crypto.randomUUID(), title: "New conversation", updated_at: new Date().toISOString() };
  const threads = loadThreads();
  threads.unshift(t);
  saveThreads(threads);
  return t;
}

export async function deleteThread(data?: unknown): Promise<void> {
  const { id } = (data ?? {}) as { id?: string };
  if (!id) return;
  saveThreads(loadThreads().filter(t => t.id !== id));
  localStorage.removeItem(`maal_msgs_${id}`);
}

export async function getThreadMessages(data?: unknown): Promise<Message[]> {
  const { threadId } = (data ?? {}) as { threadId?: string };
  if (!threadId) return [];
  try { return JSON.parse(localStorage.getItem(`maal_msgs_${threadId}`) || "[]"); } catch { return []; }
}

export async function sendAdvisorMessage(data?: unknown): Promise<{ reply: string }> {
  const { threadId, content } = (data ?? {}) as { threadId?: string; content?: string };
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
    });
    const json = r.ok ? await r.json() : null;
    const reply = json?.reply ?? json?.message ?? "I'm not able to respond right now.";

    msgs.push({ id: crypto.randomUUID(), role: "assistant", content: reply, created_at: new Date().toISOString() });
    localStorage.setItem(`maal_msgs_${threadId}`, JSON.stringify(msgs));
    return { reply };
  } catch {
    return { reply: "Unable to reach advisor. Please try again." };
  }
}
