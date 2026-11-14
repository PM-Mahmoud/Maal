import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AdvisorWorkspace } from "./AdvisorWorkspace";
import { createThread } from "@/lib/advisor.functions";
import "./advisor.css";

const OPEN_EVENT = "maal:open-advisor";

type OpenDetail = { threadId?: string | null; question?: string };

/**
 * Open the advisor pop-up from anywhere (e.g. an "Ask anything" button):
 *   openAdvisorPopup()                      — welcome state
 *   openAdvisorPopup({ threadId })          — straight into a chat
 *   openAdvisorPopup({ question: "…" })     — start a chat with this question
 * Requires one uncontrolled <AdvisorPopup /> to be mounted (e.g. in AppShell).
 */
export function openAdvisorPopup(detail: OpenDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail }));
}

/**
 * The advisor pop-up (Figma "Advisor popup" → "Advisor workspace"): opens as a
 * small welcome card over the current page and expands into the full workspace
 * (chat list + conversation) once a chat starts or the list is opened.
 *
 * Uncontrolled (recommended): mount `<AdvisorPopup />` once and call
 * `openAdvisorPopup()`. Controlled: pass `open` + `onOpenChange`.
 */
export function AdvisorPopup({
  open: openProp, onOpenChange, initialThreadId = null,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialThreadId?: string | null;
}) {
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? !!openProp : openState;
  const [activeId, setActiveId] = useState<string | null>(initialThreadId);
  const [expanded, setExpanded] = useState(!!initialThreadId);

  const setOpen = useCallback((v: boolean) => {
    if (!controlled) setOpenState(v);
    onOpenChange?.(v);
  }, [controlled, onOpenChange]);

  // Global open event (uncontrolled usage).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail || {};
      if (d.question && d.question.trim()) {
        // Hand the question to the workspace's new-chat flow via the same
        // autosend handoff the dashboard tile uses.
        createThread().then((t) => {
          try { localStorage.setItem(`maal_autosend_${t.id}`, d.question!.trim()); } catch { /* ignore */ }
          setActiveId(t.id); setExpanded(true); setOpen(true);
        }).catch(() => { setActiveId(null); setExpanded(false); setOpen(true); });
        return;
      }
      setActiveId(d.threadId ?? null);
      setExpanded(!!d.threadId);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [setOpen]);

  // Escape closes (dialogs/menus inside stop the event first); lock page scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, setOpen]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="mx-adv mx-adv-pop-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="mx-adv-pop" data-size={expanded ? "expanded" : "compact"} role="dialog" aria-modal="true" aria-label="Maal advisor">
        <AdvisorWorkspace
          variant="popup"
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); if (id) setExpanded(true); }}
          onClose={() => setOpen(false)}
          compact={!expanded}
          onExpand={() => setExpanded(true)}
        />
      </div>
    </div>,
    document.body,
  );
}

export default AdvisorPopup;
