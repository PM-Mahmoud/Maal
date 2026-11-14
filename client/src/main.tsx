import "@fontsource-variable/geist";
import "./globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { appHostRewrite, guardCrossOriginNavigation } from "./lib/app-host";

const queryClient = new QueryClient();

// Optional app subdomain (docs/app-subdomain.md): undefined unless the server
// injected the maal-app-host meta tag, i.e. unless APP_HOST is set.
const rewrite = appHostRewrite();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  ...(rewrite ? { rewrite } : {}),
});
if (rewrite) guardCrossOriginNavigation(router);

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
