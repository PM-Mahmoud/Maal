import { useEffect, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Minus, X } from "lucide-react";
import { aud } from "@/components/maal/home/format";
import type { CustomCategory } from "./api";
import { categoryLook } from "./icons";
import { catVars } from "../categoryColour";

// The 18 built-in groups (lib/transaction-categories.js order). Money that only
// moves between the user's own accounts, and income, aren't expense categories.
export const BUILT_IN_GROUPS = [
  "Income", "Credit Card Payments", "Transfers", "Financial", "Savings & Investments", "Housing",
  "Bills & Utilities", "Food & Dining", "Health & Wellness", "Auto & Transport", "Shopping",
  "Travel & Lifestyle", "Education", "Children", "Recurring & Subscriptions", "Business",
  "Gifts & Donations", "Other",
];
const NOT_EXPENSE = ["Income", "Credit Card Payments", "Transfers"];

/** Every category a budget can sit on: built-in expense groups, then custom expense categories. */
export function expenseCategories(custom: CustomCategory[], excluded?: string[]): string[] {
  const skip = new Set([...NOT_EXPENSE, ...(excluded ?? [])]);
  return [
    ...BUILT_IN_GROUPS.filter((g) => !skip.has(g)),
    ...custom.filter((c) => c.kind === "expense").map((c) => c.name),
  ];
}

export function incomeCategoryNames(custom: CustomCategory[]): string[] {
  return custom.filter((c) => c.kind === "income").map((c) => c.name);
}

/** Round category icon on its category tint (shared palette; custom categories use their stored colour). */
export function CatIcon({ name, custom, size = 32 }: { name: string; custom: CustomCategory[]; size?: number }) {
  const { Icon } = categoryLook(name, custom);
  return (
    <span className="bd-icon cat-chip" aria-hidden style={{ width: size, height: size, ...catVars(name, custom) }}>
      <Icon />
    </span>
  );
}

/** "+12%" / "−8%" / "New" badge. Spending going down is good. */
export function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return <span className="bd-chg" data-tone="up">New</span>;
  if (change === 0) return <span className="bd-chg"><Minus aria-hidden />0%</span>;
  const up = change > 0;
  return (
    <span className="bd-chg" data-tone={up ? "up" : "down"}>
      {up ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
      {Math.abs(change) >= 1000 ? ">999" : Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%
      <span className="sr-only">{up ? " more than last month" : " less than last month"}</span>
    </span>
  );
}

/** Donut in category colours (SVG rings; the total sits in positioned HTML). */
export function Donut({ rows, total, label, privacy, colourOf }: { rows: Array<{ group: string; amount: number }>; total: number; label: string; privacy: boolean; colourOf: (name: string) => string }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="bd-donut">
      <svg viewBox="0 0 180 180" role="img" aria-label={privacy ? label : `${label}: ${rows.map((x) => `${x.group} ${aud(x.amount)}`).join(", ")}`}>
        <circle cx="90" cy="90" r={r} className="bd-donut-track" />
        {rows.map((row) => {
          const len = total > 0 ? (row.amount / total) * c : 0;
          const gap = rows.length > 1 ? Math.min(2, len / 2) : 0;
          const el = (
            <circle key={row.group} cx="90" cy="90" r={r} className="bd-donut-seg" style={{ stroke: colourOf(row.group) }}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="bd-donut-text">
        <span className="bd-donut-amt mh-amount">{aud(total)}</span>
        <span className="bd-donut-sub">{label}</span>
      </div>
    </div>
  );
}

/** 240° gauge, monochrome; red once over budget. */
export function Gauge({ pct }: { pct: number }) {
  const r = 80;
  const arc = (240 / 360) * 2 * Math.PI * r;
  const full = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * arc;
  return (
    <svg className="bd-gauge" viewBox="0 0 200 170" aria-hidden>
      <circle cx="100" cy="100" r={r} className="bd-gauge-track" strokeDasharray={`${arc} ${full}`} transform="rotate(150 100 100)" />
      {filled > 0 && (
        <circle cx="100" cy="100" r={r} className="bd-gauge-fill" data-over={pct > 100}
          strokeDasharray={`${filled} ${full}`} transform="rotate(150 100 100)" />
      )}
    </svg>
  );
}

/** Self-dismissing confirmation toast. */
export function Toast({ title, text, onClose }: { title: string; text?: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="bd-toast" role="status" aria-live="polite">
      <Check className="bd-toast-icon" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="bd-toast-title">{title}</span>
        {text && <span className="bd-toast-text">{text}</span>}
      </span>
      <button type="button" className="ss-iconbtn" onClick={onClose} aria-label="Dismiss"><X aria-hidden /></button>
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="bd-error" role="alert">{children}</p>;
}

/** "November 2026" for (year, month 0-11). */
export const monthLabel = (year: number, month: number, style: "long" | "short" = "long") =>
  new Date(year, month, 1).toLocaleDateString("en-AU", { month: style, year: "numeric" });
