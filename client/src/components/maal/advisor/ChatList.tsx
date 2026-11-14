import { useEffect, useRef, useState } from "react";
import { Star, MoreVertical, Pencil, Trash2, Plus, Brain } from "lucide-react";
import type { Thread } from "@/lib/advisor.functions";

export type ThreadGroup = { key: string; title: string; threads: Thread[] };

/** Favourites first, then recency buckets (local time). */
export function groupThreads(threads: Thread[], now = new Date()): ThreadGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: ThreadGroup[] = [
    { key: "fav", title: "Favourites", threads: [] },
    { key: "today", title: "Today", threads: [] },
    { key: "yesterday", title: "Yesterday", threads: [] },
    { key: "week", title: "Previous 7 days", threads: [] },
    { key: "month", title: "Previous 30 days", threads: [] },
    { key: "older", title: "Older", threads: [] },
  ];
  const by = Object.fromEntries(buckets.map((b) => [b.key, b])) as Record<string, ThreadGroup>;
  for (const t of threads) {
    if (t.is_favourite) { by.fav.threads.push(t); continue; }
    const ts = new Date(t.updated_at).getTime() || 0;
    if (ts >= startOfToday) by.today.threads.push(t);
    else if (ts >= startOfToday - day) by.yesterday.threads.push(t);
    else if (ts >= startOfToday - 7 * day) by.week.threads.push(t);
    else if (ts >= startOfToday - 30 * day) by.month.threads.push(t);
    else by.older.threads.push(t);
  }
  return buckets.filter((b) => b.threads.length);
}

function ChatActionsMenu({
  thread, onClose, onFavourite, onRename, onDelete,
}: {
  thread: Thread;
  onClose: () => void;
  onFavourite: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const act = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <div ref={ref} className="mx-adv-menu" role="menu" aria-label={`Actions for ${thread.title}`}>
      <button type="button" role="menuitem" className="mx-adv-menu-item" onClick={act(onFavourite)}>
        <Star className="size-5" fill={thread.is_favourite ? "currentColor" : "none"} />
        {thread.is_favourite ? "Remove from favourites" : "Add to favourites"}
      </button>
      <button type="button" role="menuitem" className="mx-adv-menu-item" onClick={act(onRename)}>
        <Pencil className="size-5" /> Rename
      </button>
      <button type="button" role="menuitem" className="mx-adv-menu-item mx-adv-menu-item--danger" onClick={act(onDelete)}>
        <Trash2 className="size-5" /> Delete
      </button>
    </div>
  );
}

export function ChatList({
  threads, activeId, loadFailed, onRetry, onSelect, onNew, newBusy, onOpenMemory, onFavourite, onRename, onDelete, open,
}: {
  threads: Thread[] | null;
  activeId: string | null;
  loadFailed: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  newBusy?: boolean;
  onOpenMemory: () => void;
  onFavourite: (t: Thread) => void;
  onRename: (t: Thread) => void;
  onDelete: (t: Thread) => void;
  open: boolean;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const groups = threads ? groupThreads(threads) : [];

  return (
    <aside className="mx-adv-side" data-open={open} aria-label="Your chats">
      <nav className="mx-adv-side-list">
        {threads === null && !loadFailed && <p className="mx-adv-empty-list">Loading chats…</p>}
        {loadFailed && (
          <p className="mx-adv-empty-list">
            Couldn't load your chats.{" "}
            <button type="button" className="mx-adv-text-btn" style={{ fontSize: 13, padding: 0 }} onClick={onRetry}>Retry</button>
          </p>
        )}
        {threads !== null && threads.length === 0 && <p className="mx-adv-empty-list">Your chats will appear here.</p>}
        {groups.map((g) => (
          <section key={g.key} className="mx-adv-group" aria-label={g.title}>
            <h3 className="mx-adv-group-title">
              {g.key === "fav" && <Star className="size-4" />}
              {g.title}
            </h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {g.threads.map((t) => (
                <li key={t.id} className="mx-adv-chat" data-active={t.id === activeId}>
                  <button
                    type="button"
                    className="mx-adv-chat-link"
                    onClick={() => onSelect(t.id)}
                    aria-current={t.id === activeId ? "page" : undefined}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                  <button
                    type="button"
                    className="mx-adv-chat-more"
                    aria-label={`More options for ${t.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuFor === t.id}
                    onClick={() => setMenuFor((cur) => (cur === t.id ? null : t.id))}
                  >
                    <MoreVertical className="size-4" />
                  </button>
                  {menuFor === t.id && (
                    <ChatActionsMenu
                      thread={t}
                      onClose={() => setMenuFor(null)}
                      onFavourite={() => onFavourite(t)}
                      onRename={() => onRename(t)}
                      onDelete={() => onDelete(t)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <div className="mx-adv-side-foot">
        <button type="button" className="mx-adv-side-btn" onClick={onNew} disabled={newBusy}>
          New chat <Plus className="size-5" />
        </button>
        <button type="button" className="mx-adv-side-btn" onClick={onOpenMemory}>
          Financial memory <Brain className="size-5" />
        </button>
      </div>
    </aside>
  );
}
