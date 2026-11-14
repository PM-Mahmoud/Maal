import { createFileRoute } from "@tanstack/react-router";
import { HomeDashboard } from "@/components/maal/home/HomeDashboard";
import { SavedWidgets } from "@/components/maal/dashboard/SavedWidgets";
import { MembershipGate } from "@/components/maal/app/MembershipGate";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => (
    // Trial banner + paywall over Home once the trial ends (onboarding v2).
    <MembershipGate>
      <HomeDashboard />
      <SavedWidgets />
    </MembershipGate>
  ),
});
