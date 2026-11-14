import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/maal/nav/EmptyPage";

// Left empty until the Figma designs are finalised (2026-11-15).
export const Route = createFileRoute("/_authenticated/app/services/brokerage")({ component: Brokerage });

function Brokerage() {
  return <EmptyPage title="Brokerage" />;
}
