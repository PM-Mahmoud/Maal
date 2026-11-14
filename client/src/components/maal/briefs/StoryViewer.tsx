import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { MaalMark } from "@/components/maal/MaalMark";
import "./briefs.css";

export type StorySlide = {
  key: string;
  /** Full-bleed cover/closing slide on a coloured background (white text). */
  background?: "recap" | "market";
  content: ReactNode;
};

/** Story-style modal (Figma "Weekly recap" / "Daily market brief" frames):
 *  dimmed backdrop, 608×1080 card, segmented progress, round prev/next buttons
 *  outside the card. Keyboard: ←/→ to move, Esc to close. Swipe on phones. */
export function StoryViewer({
  slides,
  label,
  onClose,
  initialIndex = 0,
}: {
  slides: StorySlide[];
  label: string;
  onClose: () => void;
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, slides.length - 1)));
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const count = slides.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const slide = slides[safeIndex];

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.max(0, Math.min(count - 1, i + delta)));
  }, [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [go, onClose]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [safeIndex]);

  if (!slide) return null;
  const dark = !!slide.background;

  return createPortal(
    <div
      className="mb-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mb-stage">
        <button type="button" className="mb-nav" onClick={() => go(-1)} disabled={safeIndex === 0} aria-label="Previous slide">
          <ChevronLeft size={30} strokeWidth={1.6} />
        </button>

        <div
          ref={cardRef}
          className={`mb-card${dark ? ` is-dark mb-bg-${slide.background}` : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${label}, ${safeIndex + 1} of ${count}`}
          tabIndex={-1}
          onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start == null || end == null) return;
            if (end - start < -50) go(1);
            else if (end - start > 50) go(-1);
          }}
        >
          <div className="mb-top">
            <MaalMark size={24} />
            <div className="mb-progress" aria-hidden="true">
              {slides.map((s, i) => <span key={s.key} className={i <= safeIndex ? "on" : ""} />)}
            </div>
            <button type="button" className="mb-icon-btn" onClick={onClose} aria-label={`Close ${label}`}>
              <X size={20} strokeWidth={1.6} />
            </button>
          </div>
          {dark ? (
            <Fragment key={slide.key}>{slide.content}</Fragment>
          ) : (
            <div className="mb-body" ref={bodyRef} key={slide.key}>{slide.content}</div>
          )}
        </div>

        <button type="button" className="mb-nav" onClick={() => go(1)} disabled={safeIndex >= count - 1} aria-label="Next slide">
          <ChevronRight size={30} strokeWidth={1.6} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Centred cover / closing content for a dark slide. */
export function StoryCover({ title, subtitle, children, footer }: { title: string; subtitle?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mb-cover">
      <MaalMark size={40} className="mb-cover-mark" />
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
      {children ? <div className="mb-cta-wrap">{children}</div> : null}
      {footer}
    </div>
  );
}

export function StoryState({ children }: { children: ReactNode }) {
  return <div className="mb-state">{children}</div>;
}

export function StorySkeleton() {
  return (
    <div className="mb-skel" aria-label="Loading" role="status">
      <i style={{ width: "40%" }} />
      <i className="big" />
      <i className="big" style={{ width: "60%" }} />
      <i style={{ height: 220, marginTop: 10 }} />
      <i />
      <i style={{ width: "85%" }} />
    </div>
  );
}
