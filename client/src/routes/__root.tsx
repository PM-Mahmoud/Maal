import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/maal/not-found/NotFoundPage";
import { Toaster } from "sonner";

// Unknown client routes outside /app (unknown /app/* paths render the same page
// inside the app shell — see _authenticated/app.tsx).
function NotFoundComponent() {
  return <NotFoundPage signedIn={false} />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
