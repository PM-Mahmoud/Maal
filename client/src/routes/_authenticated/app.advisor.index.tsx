import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { listThreads, createThread, deleteThread } from "@/lib/advisor.functions";
import { MemoryPanel } from "@/components/maal/advisor/MemoryPanel";
import { Disclaimer } from "@/components/maal/Disclaimer";

export const Route = createFileRoute("/_authenticated/app/advisor/")({
  component: AdvisorIndex,
});

type Thread = { id: string; title: string; updated_at: string };

function AdvisorIndex() {
  const navigate = useNavigate();
  const list = listThreads;
  const create = createThread;
  const del = deleteThread;
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMemory, setShowMemory] = useState(false);

  useEffect(() => { list().then((rows) => setThreads(rows as Thread[])); }, [list]);

  async function startNew() {
    if (busy) return;
    setBusy(true);
    try {
      const t = await create();
      navigate({ to: "/app/advisor/$threadId", params: { threadId: (t as any).id } });
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    await del({ data: { threadId: id } });
    setThreads((cur) => (cur ?? []).filter((t) => t.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Advisor</p>
          <h1 className="text-[28px] tracking-display font-bold leading-tight">Conversations</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMemory(true)}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-2 rounded-[8px] text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            <Brain className="size-3.5" /> Memory
          </button>
          <button
            onClick={startNew}
            disabled={busy}
            className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[12px] font-semibold disabled:opacity-40"
          >
            New conversation
          </button>
        </div>
      </div>

      {threads === null && <p className="text-[13px] text-muted-foreground">Loading…</p>}
      {threads !== null && threads.length === 0 && (
        <div className="p-6 border border-border rounded-[12px] bg-[var(--surface)]">
          <p className="text-[14px] font-semibold mb-1">No conversations yet</p>
          <p className="text-[13px] text-muted-foreground">Start a new one to ask your CFO about your money.</p>
        </div>
      )}

      <ul className="divide-y divide-border border border-border rounded-[12px] bg-[var(--surface)] overflow-hidden">
        {(threads ?? []).map((t) => (
          <li key={t.id} className="flex items-center">
            <Link
              to="/app/advisor/$threadId"
              params={{ threadId: t.id }}
              className="flex-1 px-5 py-4 hover:bg-[var(--secondary)]"
            >
              <p className="text-[14px] font-medium truncate">{t.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(t.updated_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </Link>
            <button
              onClick={() => remove(t.id)}
              className="px-4 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label="Delete conversation"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-10"><Disclaimer variant="inline" /></div>
    </div>
  );
}