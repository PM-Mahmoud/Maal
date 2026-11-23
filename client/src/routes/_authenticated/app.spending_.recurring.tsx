import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RecurringPage } from "@/components/maal/spending/recurring/RecurringPage";

type RecurringSearch = { add?: 1 };

// Spending › Recurring (redesign session 2, HEL-104/105) at /app/spending/recurring.
// `spending_` opts out of nesting under /app/spending, whose component renders
// the overview with an <Outlet/> below it; this page stands on its own.
// ?add=1 opens the "Add recurring transaction" flow (the overview's Upcoming
// empty state links here).
export const Route = createFileRoute("/_authenticated/app/spending_/recurring")({
  validateSearch: (search: Record<string, unknown>): RecurringSearch =>
    search.add === 1 || search.add === "1" || search.add === true ? { add: 1 } : {},
  component: RecurringRoute,
});

function RecurringRoute() {
  const navigate = useNavigate();
  const { add } = Route.useSearch();
  return (
    <div className="ss-entry">
      <RecurringPage openAdd={add === 1}
        onAddClosed={() => { if (add) void navigate({ to: "/app/spending/recurring", search: {}, replace: true }); }} />
    </div>
  );
}
