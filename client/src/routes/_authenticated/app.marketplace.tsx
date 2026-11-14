import { createFileRoute, redirect } from "@tanstack/react-router";

// Kept so old links and bookmarks still work (Track/Services nav, 2026-11-15).
export const Route = createFileRoute("/_authenticated/app/marketplace")({
  beforeLoad: () => { throw redirect({ to: "/app/invest" }); },
});
