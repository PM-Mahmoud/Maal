import { useEffect, useRef, useState } from "react";

import { Bell } from "lucide-react";
import { listNotifications, markNotificationsRead } from "@/lib/notifications.functions";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const list = listNotifications;
  const markRead = markNotificationsRead;
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read_at).length;

  async function refresh() {
    try {
      const r = await list();
      setItems(Array.isArray(r) ? (r as any[]) : []);
    } catch {}
  }

  useEffect(() => {
    refresh();
    // Realtime is not available on this backend — the channel API in
    // integrations/api.ts is an explicit no-op stub, so subscribing here
    // could never fire. Refetch on window focus instead of pretending.
    function onFocus() { refresh(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markRead();
      setItems((xs) => xs.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={`Notifications${unread ? ` — ${unread} unread` : ""}`}
        className="relative w-9 h-9 rounded-full hover:bg-[var(--secondary)] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--mint)] text-[#0E0E10] text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[340px] bg-[var(--surface)] border border-border rounded-[12px] shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-[13px] font-semibold">Notifications</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-muted-foreground text-center">
                You're all caught up. Radar updates will appear here.
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className="px-4 py-3 border-b border-border last:border-0 hover:bg-[var(--secondary)]/50">
                    <a href={n.link ?? "#"} className="block">
                      <p className="text-[13px] font-medium text-foreground line-clamp-2">{n.title}</p>
                      {n.body && <p className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}