import { Banknote, Receipt, Repeat } from "lucide-react";
import type { RecurringKind } from "../../../../../../shared/recurring.mjs";
import { catVars } from "../categoryColour";

const ICONS = { bill: Receipt, subscription: Repeat, income: Banknote } as const;

/** Icon per recurring kind (bill / subscription / income). */
export function KindIcon({ kind, className }: { kind: RecurringKind; className?: string }) {
  const Icon = ICONS[kind] || Receipt;
  return <Icon className={className} aria-hidden />;
}

/** Each kind wears its category's colour from the shared palette, so a bill
 *  here matches Bills & Utilities on the overview, breakdown and reports. */
export const KIND_GROUP: Record<RecurringKind, string> = {
  bill: "Bills & Utilities", subscription: "Recurring & Subscriptions", income: "Income",
};

/** Round badge used on the calendar and in rows, tinted by kind. */
export function KindBadge({ kind, size = "md" }: { kind: RecurringKind; size?: "sm" | "md" }) {
  return (
    <span className="rc-badge cat-chip" data-kind={kind} data-size={size} style={catVars(KIND_GROUP[kind] || "Bills & Utilities")} aria-hidden>
      <KindIcon kind={kind} />
    </span>
  );
}
