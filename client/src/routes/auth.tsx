import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

// RETIRED: the React auth page is gone — /login and /signup (server-rendered)
// are the only auth surfaces. This route survives solely so old bookmarks and
// in-flight client navigations to /auth land on the real login page. The
// server also 301s /auth → /login, so this only runs on client-side nav.
export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in — Maal" }],
  }),
  component: AuthRedirect,
});

function AuthRedirect() {
  useEffect(() => {
    window.location.replace("/login");
  }, []);
  return null;
}
