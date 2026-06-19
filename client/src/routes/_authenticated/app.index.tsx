import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/maal/dashboard/Dashboard";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => <Dashboard />,
});
