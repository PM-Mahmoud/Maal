import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/maal/nav/EmptyPage";

// Left empty until the Figma designs are finalised (2026-11-15).
// The profit-based partner products slot (read-only offerings from
// getMarketplace in @/lib/wealth-services.functions) returns here when the
// Figma designs land.
export const Route = createFileRoute("/_authenticated/app/invest")({ component: Invest });

function Invest() {
  return <EmptyPage title="Invest" />;
}
