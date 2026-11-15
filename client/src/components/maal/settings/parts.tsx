import { useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, X } from "lucide-react";
import "./settings.css";

/** Figma floating-label field box: label sits inside, shrinks up once filled. */
export function Field({
  id, label, filled, invalid, readOnly, children, select,
}: {
  id: string; label: string; filled: boolean; invalid?: boolean; readOnly?: boolean; children: ReactNode; select?: boolean;
}) {
  return (
    <div className="ms-field" data-filled={filled} data-invalid={!!invalid} data-readonly={!!readOnly}>
      <label className="ms-label" htmlFor={id}>{label}</label>
      {children}
      {select && <ChevronDown className="ms-chevron" aria-hidden strokeWidth={1.6} />}
    </div>
  );
}

export function SectionRule({ children }: { children: ReactNode }) {
  return <p className="ms-rule">{children}</p>;
}

/** Success notification with a countdown bar (Figma "Profile updated." / "Your request has been received."). */
export function SettingsToast({
  title, sub, onDismiss, ms = 5000,
}: { title: string; sub?: string; onDismiss: () => void; ms?: number }) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const t = window.setTimeout(() => dismiss.current(), ms);
    return () => window.clearTimeout(t);
  }, [title, ms]);
  return (
    <div className="mh ms-toast" role="status" aria-live="polite">
      <CheckCircle2 className="ms-toast-icon" strokeWidth={1.8} aria-hidden />
      <div>
        <p className="ms-toast-title">{title}</p>
        {sub && <p className="ms-toast-sub">{sub}</p>}
      </div>
      <button type="button" className="mh-close" aria-label="Dismiss notification" onClick={onDismiss}>
        <X className="size-4" />
      </button>
      <div className="ms-toast-track"><div className="ms-toast-bar" style={{ animationDuration: `${ms}ms` }} /></div>
    </div>
  );
}
