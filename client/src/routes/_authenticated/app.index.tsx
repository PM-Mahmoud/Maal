import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/maal/dashboard/Dashboard";
import { SavedWidgets } from "@/components/maal/dashboard/SavedWidgets";
import { SetupChecklist } from "@/components/maal/dashboard/SetupChecklist";
import { MembershipGate } from "@/components/maal/app/MembershipGate";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => (
    // Trial banner + paywall over the dashboard once the trial ends (onboarding v2).
    <MembershipGate>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 pt-6 md:pt-8">
        <SetupChecklist />
      </div>
      {/* Ask Maal composer now lives inside Dashboard as a full-width band below
          the KPI tiles (net worth / investments / cash / debts). */}
      <Dashboard />
      <SavedWidgets />
    </MembershipGate>
  ),
});
