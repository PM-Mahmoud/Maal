import { useCallback, useEffect, useRef, useState } from "react";
import { Download, PanelLeft, X, Maximize2 } from "lucide-react";
import {
  listThreads, createThread, deleteThread, renameThread, setThreadFavourite, type Thread,
} from "@/lib/advisor.functions";
import { MemoryPanel } from "./MemoryPanel";
import { ChatList } from "./ChatList";
import { ChatConversation, WelcomeState, MemoryHint, Composer } from "./ChatConversation";
import { RenameChatDialog, DeleteChatDialog, AdvisorToast, type ToastState } from "./ChatDialogs";
import "./advisor.css";

/** Chat list state + server-persisted favourite / rename / delete. */
export function useAdvisorThreads() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoadFailed(false);
    try { setThreads(await listThreads()); }
    catch { setThreads((cur) => cur); setLoadFailed(true); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback((t: Thread) => {
    setThreads((cur) => {
      const rest = (cur ?? []).filter((x) => x.id !== t.id);
      return [t, ...rest];
    });
  }, []);

  return {
    threads, loadFailed, refresh, upsert,
    async create(): Promise<Thread> { const t = await createThread(); upsert(t); return t; },
    async rename(id: string, title: string) { const t = await renameThread(id, title); setThreads((cur) => (cur ?? []).map((x) => (x.id === id ? t : x))); return t; },
    async favourite(id: string, fav: boolean) { const t = await setThreadFavourite(id, fav); setThreads((cur) => (cur ?? []).map((x) => (x.id === id ? t : x))); return t; },
    async remove(id: string) { await deleteThread({ id }); setThreads((cur) => (cur ?? []).filter((x) => x.id !== id)); },
  };
}

/**
 * The advisor workspace: chat list (favourites + recency groups, with
 * favourite / rename / delete actions) beside the active conversation.
 * Used full-page at /app/advisor and inside <AdvisorPopup/>.
 */
export function AdvisorWorkspace({
  activeId, onSelect, variant = "page", onClose, compact = false, onExpand,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  variant?: "page" | "popup";
  onClose?: () => void;
  /** Popup only: start with the chat list collapsed (the small welcome pop-up). */
  compact?: boolean;
  onExpand?: () => void;
}) {
  const store = useAdvisorThreads();
  const [sideOpen, setSideOpen] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [renaming, setRenaming] = useState<Thread | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [starting, setStarting] = useState(false);
  const [newInput, setNewInput] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [hasMessages, setHasMessages] = useState(false);
  const downloadRef = useRef<(() => void) | null>(null);

  const notify = useCallback((text: string, tone: "success" | "error" = "success") => {
    setToast({ id: Date.now(), title: tone === "success" ? "Success" : "Something went wrong", text, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Close the mobile drawer whenever the active chat changes.
  useEffect(() => { setSideOpen(false); }, [activeId]);

  const select = (id: string | null) => { onSelect(id); setSideOpen(false); };

  async function startWith(text: string) {
    const t = text.trim();
    if (!t || starting) return;
    setStarting(true); setStartError(null);
    try {
      const thread = await store.create();
      try { localStorage.setItem(`maal_autosend_${thread.id}`, t); } catch { /* ignore */ }
      setNewInput("");
      onExpand?.();
      onSelect(thread.id);
    } catch {
      setStartError("Couldn't start your chat — check your connection and try again.");
      setNewInput(t);
    } finally { setStarting(false); }
  }

  async function toggleFavourite(t: Thread) {
    try {
      await store.favourite(t.id, !t.is_favourite);
      notify(t.is_favourite ? "Chat removed from favourites." : "Chat added to favourites.");
    } catch (e: any) { notify(e?.message || "Couldn't update favourites.", "error"); }
  }

  // Desktop: the list is always visible except in the compact pop-up, where the
  // toggle expands the pop-up into the full workspace. Mobile: it's a drawer.
  const showSideToggle = variant === "popup" && compact;
  const onToggleSide = () => {
    if (showSideToggle && onExpand && typeof window !== "undefined" && window.innerWidth > 900) { onExpand(); return; }
    setSideOpen((o) => !o);
  };

  return (
    <div className={`mx-adv mx-adv-shell mx-adv-shell--${variant}`} data-compact={compact}>
      <div className="mx-adv-frame">
        <header className="mx-adv-header">
          <div className="mx-adv-header-left">
            <button
              type="button"
              className={`mx-adv-icon-btn ${showSideToggle ? "" : "mx-adv-side-toggle--desktop-hidden"}`}
              onClick={onToggleSide}
              aria-label={sideOpen ? "Hide chats" : "Show chats"}
              aria-expanded={sideOpen}
            >
              <PanelLeft className="size-5" />
            </button>
            <span className="mx-adv-kicker">Maal advisor</span>
          </div>
          <div className="mx-adv-header-actions">
            {activeId && hasMessages && (
              <button type="button" className="mx-adv-icon-btn" onClick={() => downloadRef.current?.()} aria-label="Download chat" title="Download chat">
                <Download className="size-[18px]" />
              </button>
            )}
            {variant === "popup" && compact && onExpand && (
              <button type="button" className="mx-adv-icon-btn" onClick={onExpand} aria-label="Expand advisor" title="Expand">
                <Maximize2 className="size-[18px]" />
              </button>
            )}
            {onClose && (
              <button type="button" className="mx-adv-icon-btn" onClick={onClose} aria-label="Close advisor">
                <X className="size-5" />
              </button>
            )}
          </div>
        </header>

        <div className="mx-adv-body">
          <div className="mx-adv-side-scrim" data-open={sideOpen} onClick={() => setSideOpen(false)} />
          <ChatList
            threads={store.threads}
            activeId={activeId}
            loadFailed={store.loadFailed}
            onRetry={store.refresh}
            onSelect={(id) => { onExpand?.(); select(id); }}
            onNew={() => select(null)}
            newBusy={starting}
            onOpenMemory={() => setShowMemory(true)}
            onFavourite={toggleFavourite}
            onRename={(t) => setRenaming(t)}
            onDelete={(t) => setDeleting(t)}
            open={sideOpen}
          />

          {activeId ? (
            <ChatConversation
              key={activeId}
              threadId={activeId}
              onTurnSaved={(t) => { if (t) store.upsert(t); else store.refresh(); }}
              onOpenMemory={() => setShowMemory(true)}
              downloadRef={downloadRef}
              onHasMessages={setHasMessages}
            />
          ) : (
            <div className="mx-adv-main">
              <div className="mx-adv-scroll" style={{ display: "flex", flexDirection: "column" }}>
                <WelcomeState onPick={startWith} disabled={starting} compact={compact} />
              </div>
              <div style={{ maxWidth: 980, width: "100%", margin: "0 auto" }}>
                {startError && <p className="mx-adv-error" role="alert" style={{ marginBottom: 8 }}>{startError}</p>}
                <MemoryHint onOpenMemory={() => setShowMemory(true)} />
                <Composer value={newInput} onChange={setNewInput} onSubmit={() => startWith(newInput)} busy={starting} autoFocus={variant === "popup"} />
                <p className="mx-adv-foot-note">
                  Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showMemory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 85 }}>
          <MemoryPanel onClose={() => setShowMemory(false)} />
        </div>
      )}
      {renaming && (
        <RenameChatDialog
          currentTitle={renaming.title}
          onCancel={() => setRenaming(null)}
          onConfirm={async (title) => {
            await store.rename(renaming.id, title);
            setRenaming(null);
            notify("Chat renamed successfully.");
          }}
        />
      )}
      {deleting && (
        <DeleteChatDialog
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const id = deleting.id;
            await store.remove(id);
            setDeleting(null);
            if (id === activeId) onSelect(null);
            notify("Chat deleted successfully.");
          }}
        />
      )}
      <AdvisorToast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
