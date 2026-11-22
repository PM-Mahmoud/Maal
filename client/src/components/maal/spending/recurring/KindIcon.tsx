import { Banknote, Receipt, Repeat } from "lucide-react";
import type { RecurringKind } from "../../../../../../shared/recurring.mjs";

const ICONS = { bill: Receipt, subscription: Repeat, income: Banknote } as const;

/** Monochrome icon per recurring kind (bill / subscription / income). */
export function KindIcon({ kind, className }: { kind: RecurringKind; className?: string }) {
  const Icon = ICONS[kind] || Receipt;
  return <Icon className={className} aria-hidden />;
}

/** Round badge used on the calendar and in rows. Income gets the "good" tint; everything else stays ink. */
export function KindBadge({ kind, size = "md" }: { kind: RecurringKind; size?: "sm" | "md" }) {
  return (
    <span className="rc-badge" data-kind={kind} data-size={size} aria-hidden>
      <KindIcon kind={kind} />
    </span>
  );
}
