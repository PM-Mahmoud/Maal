import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/maal/dashboard/Dashboard";
import { SavedWidgets } from "@/components/maal/dashboard/SavedWidgets";
import { AskMaalTile } from "@/components/maal/dashboard/AskMaalTile";
import { SetupChecklist } from "@/components/maal/dashboard/SetupChecklist";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => (
    <>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-8 grid gap-4 md:grid-cols-2">
        <AskMaalTile />
        <SetupChecklist />
      </div>
      <Dashboard />
      <SavedWidgets />
    </>
  ),
});
