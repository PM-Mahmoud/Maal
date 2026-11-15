// Shared primitives for the Settings → Risk profile and Security pages:
// the outlined settings card, the modal dialog shell and a few icons.
import { useEffect, useRef, type ReactNode } from "react";
import "./settings-ui.css";

export const DISCLAIMER =
  "Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.";

export function formatAuDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function SettingsCard({ kicker, aside, children, foot }: { kicker: string; aside?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <section className="mst-card" aria-label={kicker}>
      <header className="mst-card-head">
        <h2 className="mst-kicker">{kicker}</h2>
        {aside}
      </header>
      <div className="mst-card-body">{children}</div>
      {foot && <div className="mst-card-foot">{foot}</div>}
    </section>
  );
}

export function Field({ label, value, set }: { label: string; value: string; set?: boolean }) {
  return (
    <div className="mst-field">
      <span className="mst-field-label">{label}</span>
      <span className={`mst-field-value${set ? " is-set" : ""}`}>{value}</span>
    </div>
  );
}

export function InfoLine({ children }: { children: ReactNode }) {
  return (
    <p className="mst-info">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" /><path d="M8 4.8v3.8M8 10.8v.4" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export function ArrowUpRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4.5 13.5 13.5 4.5M6 4.5h7.5V12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="m4 4 10 10M14 4 4 14" strokeLinecap="round" />
    </svg>
  );
}

/** Calm hills artwork made for Maal (replaces the reference photography). */
export function Artwork({ small }: { small?: boolean }) {
  return (
    <div className={`mst-art${small ? " is-small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 700 190" preserveAspectRatio="none">
        <path d="M0 120 C 90 70, 170 60, 260 100 S 430 150, 520 90 S 650 60, 700 80 V190 H0Z" fill="rgba(255,255,255,.28)" />
        <path d="M0 150 C 120 110, 220 120, 320 140 S 520 170, 600 130 S 680 120, 700 125 V190 H0Z" fill="rgba(5,46,65,.35)" />
        <path d="M0 175 C 150 150, 300 160, 420 172 S 620 185, 700 165 V190 H0Z" fill="rgba(2,1,9,.35)" />
      </svg>
    </div>
  );
}

/**
 * Modal dialog shell: scrim, header with kicker + close, scrollable body,
 * sticky footer. Escape and scrim clicks close; focus moves into the dialog on
 * open and returns to the opener on close.
 */
export function Dialog({ kicker, labelledBy, onClose, children, footer, progress }: {
  kicker: string;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  progress?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") || node?.querySelector<HTMLElement>("button, input, select");
    first?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]"));
      if (!items.length) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="mst mst-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="mst-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="mst-dialog-head">
          <span className="mst-kicker">{kicker}</span>
          <button type="button" className="mst-icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        {typeof progress === "number" && (
          <div className="mst-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        )}
        <div className="mst-dialog-body">{children}</div>
        {footer && <div className="mst-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}
