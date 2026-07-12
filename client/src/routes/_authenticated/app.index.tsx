import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/maal/dashboard/Dashboard";
import { SavedWidgets } from "@/components/maal/dashboard/SavedWidgets";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => (
    <>
      <Dashboard />
      <SavedWidgets />
    </>
  ),
});
