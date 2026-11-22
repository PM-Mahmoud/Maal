import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/maal/coming-soon/ComingSoonPage";

// Coming soon (2026-11-23): shared page, copy in components/maal/coming-soon/features.ts.
export const Route = createFileRoute("/_authenticated/app/services/financial-planner")({ component: FinancialPlanner });

function FinancialPlanner() {
  return <ComingSoonPage feature="financial-planner" />;
}
