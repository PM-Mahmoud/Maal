import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronLeft, RotateCcw, X } from "lucide-react";

/** Muted tag swatches (keys match lib/transaction-detail.js TAG_COLORS). */
export const TAG_SWATCHES: Record<string, { light: string; dark: string; label: string }> = {
  sand: { light: "#E8B96A", dark: "#D9A54E", label: "Sand" },
  sage: { light: "#8FB394", dark: "#7FA585", label: "Sage" },
  sky: { light: "#7FB2DE", dark: "#6CA3D4", label: "Sky" },
  lilac: { light: "#A99BE0", dark: "#9A8BD6", label: "Lilac" },
  rose: { light: "#E3A0AE", dark: "#D88F9F", label: "Rose" },
  clay: { light: "#C98563", dark: "#BD7654", label: "Clay" },
  slate: { light: "#7D8794", dark: "#8D97A3", label: "Slate" },
  teal: { light: "#5FA8A0", dark: "#57A097", label: "Teal" },
  olive: { light: "#A3A56A", dark: "#96985C", label: "Olive" },
  plum: { light: "#A2729A", dark: "#B283AA", label: "Plum" },
  gold: { light: "#CFAE3F", dark: "#C2A136", label: "Gold" },
  stone: { light: "#B3ADA3", dark: "#9D978D", label: "Stone" },
};
export const TAG_COLOR_KEYS = Object.keys(TAG_SWATCHES);

export function TagDot({ color }: { color: string }) {
  const sw = TAG_SWATCHES[color] || TAG_SWATCHES.sand;
  return <span className="td-dot" style={{ ["--td-dot" as string]: sw.light, ["--td-dot-dark" as string]: sw.dark }} aria-hidden />;
}

export function TagChip({ name, color }: { name: string; color: string }) {
  return <span className="td-tag"><TagDot color={color} />{name}</span>;
}

/** Drawer header: optional back, uppercase eyebrow title (the dialog title), right slot, close. */
export function PanelHeader({ title, onBack, backLabel, right }: { title: string; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  return (
    <header className="td-head">
      {onBack && (
        <button type="button" className="td-iconbtn" onClick={onBack} aria-label={backLabel || "Back"}>
          <ChevronLeft aria-hidden />
        </button>
      )}
      <DialogPrimitive.Title className="td-eyebrow">{title}</DialogPrimitive.Title>
      <span className="td-head-right">
        {right}
        <DialogPrimitive.Close className="td-iconbtn" aria-label="Close transaction">
          <X aria-hidden />
        </DialogPrimitive.Close>
      </span>
    </header>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className="td-switch" data-on={checked} onClick={() => onChange(!checked)}>
      <span className="td-switch-thumb" />
    </button>
  );
}

export type ToastState = { text: string; sub?: string; onUndo?: () => void } | null;

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div className="td-toast" role="status" aria-live="polite">
      <Check className="td-toast-icon" aria-hidden />
      <span className="td-toast-text">
        <strong>{toast.text}</strong>
        {toast.sub && <span>{toast.sub}</span>}
        {toast.onUndo && (
          <button type="button" className="td-btn-sm td-toast-undo" onClick={toast.onUndo}>
            <RotateCcw aria-hidden /> Undo changes
          </button>
        )}
      </span>
      <button type="button" className="td-iconbtn" onClick={onClose} aria-label="Dismiss">
        <X aria-hidden />
      </button>
    </div>
  );
}

export function ErrorNote({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <p className="td-error" role="alert">
      {message}{" "}
      {onDismiss && <button type="button" className="td-link" onClick={onDismiss}>Dismiss</button>}
    </p>
  );
}

/** Reset + Save row used by every editor card. */
export function EditorActions({ onReset, onSave, saveLabel = "Save", saving, disabled }: {
  onReset?: () => void; onSave: () => void; saveLabel?: string; saving?: boolean; disabled?: boolean;
}) {
  return (
    <div className="td-actions">
      {onReset && <button type="button" className="td-btn-sm" onClick={onReset} disabled={saving}>Reset</button>}
      <button type="button" className="td-btn-sm td-btn-ink" onClick={onSave} disabled={saving || disabled}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

const fullDate = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
/** "Thursday, 12 Feb 2026" (date-only strings are read as local days). */
export function longDate(s?: string | null) {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? "" : fullDate.format(d);
}
