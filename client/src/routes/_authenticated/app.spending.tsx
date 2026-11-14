import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/maal/nav/EmptyPage";

// Left empty until the Figma designs are finalised (2026-11-15).
export const Route = createFileRoute("/_authenticated/app/spending")({ component: Spending });

function Spending() {
  return <EmptyPage title="Spending" />;
}
