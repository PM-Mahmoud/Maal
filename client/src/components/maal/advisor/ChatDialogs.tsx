import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle } from "lucide-react";

function useEscape(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose, enabled]);
}

function DialogFrame({ title, onClose, children, labelId }: { title: string; onClose: () => void; children: ReactNode; labelId: string }) {
  useEscape(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="mx-adv mx-adv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-adv-dialog" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <div className="mx-adv-dialog-head">
          <span id={labelId} className="mx-adv-kicker">{title}</span>
          <button type="button" className="mx-adv-icon-btn" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Rename chat — Figma "Rename chat dialog". */
export function RenameChatDialog({
  currentTitle, onCancel, onConfirm,
}: { currentTitle: string; onCancel: () => void; onConfirm: (title: string) => Promise<void> }) {
  const [value, setValue] = useState(currentTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const trimmed = value.replace(/\s+/g, " ").trim();
  async function submit() {
    if (!trimmed || busy) return;
    if (trimmed === currentTitle) { onCancel(); return; }
    setBusy(true); setError(null);
    try { await onConfirm(trimmed); }
    catch (e: any) { setError(e?.message || "Couldn't rename that chat. Please try again."); setBusy(false); }
  }

  return (
    <DialogFrame title="Rename chat" onClose={() => !busy && onCancel()} labelId="mx-adv-rename-title">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="mx-adv-dialog-body">
          <label className="mx-adv-label" htmlFor="mx-adv-rename-input">Enter a new name for the chat</label>
          <input
            id="mx-adv-rename-input"
            ref={inputRef}
            className="mx-adv-input"
            value={value}
            maxLength={80}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          {error && <p className="mx-adv-dialog-error" role="alert">{error}</p>}
        </div>
        <div className="mx-adv-dialog-actions">
          <button type="button" className="mx-adv-text-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="mx-adv-btn" disabled={!trimmed || busy}>{busy ? "Saving…" : "Confirm"}</button>
        </div>
      </form>
    </DialogFrame>
  );
}

/** Delete chat — Figma "Delete chat dialog". */
export function DeleteChatDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);

  async function submit() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await onConfirm(); }
    catch (e: any) { setError(e?.message || "Couldn't delete that chat. Please try again."); setBusy(false); }
  }

  return (
    <DialogFrame title="Delete chat" onClose={() => !busy && onCancel()} labelId="mx-adv-delete-title">
      <div className="mx-adv-dialog-body">
        <p className="mx-adv-dialog-text">Are you sure you want to delete this chat? This action cannot be undone.</p>
        {error && <p className="mx-adv-dialog-error" role="alert">{error}</p>}
      </div>
      <div className="mx-adv-dialog-actions">
        <button type="button" className="mx-adv-text-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button ref={confirmRef} type="button" className="mx-adv-btn mx-adv-btn--danger" onClick={submit} disabled={busy}>
          {busy ? "Deleting…" : "Delete chat"}
        </button>
      </div>
    </DialogFrame>
  );
}

export type ToastState = { id: number; title: string; text: string; tone?: "success" | "error" } | null;

/** Timed notification — Figma "Success notification" (auto-dismisses with a progress bar). */
export function AdvisorToast({ toast, onDismiss, duration = 4000 }: { toast: ToastState; onDismiss: () => void; duration?: number }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss, duration]);
  if (!toast || typeof document === "undefined") return null;
  const Icon = toast.tone === "error" ? AlertCircle : CheckCircle2;
  return createPortal(
    <div className="mx-adv mx-adv-toast" role="status" aria-live="polite" data-tone={toast.tone || "success"} key={toast.id}>
      <div className="mx-adv-toast-inner">
        <Icon className="size-6" style={{ color: toast.tone === "error" ? "var(--a-danger)" : "var(--a-good)" }} />
        <div>
          <p className="mx-adv-toast-title">{toast.title}</p>
          <p className="mx-adv-toast-text">{toast.text}</p>
        </div>
        <button type="button" className="mx-adv-icon-btn" style={{ width: 28, height: 28 }} onClick={onDismiss} aria-label="Dismiss notification">
          <X className="size-4" />
        </button>
      </div>
      <div className="mx-adv-toast-track"><div className="mx-adv-toast-bar" style={{ animationDuration: `${duration}ms` }} /></div>
    </div>,
    document.body,
  );
}
