import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/maal/not-found/NotFoundPage";

export const Route = createFileRoute("/_authenticated/app")({
  component: () => <Outlet />,
  // Unknown /app/* routes: the 404 page inside the app shell. The server sends
  // these with status 404 (lib/app-routes.js).
  notFoundComponent: () => <NotFoundPage signedIn />,
});
