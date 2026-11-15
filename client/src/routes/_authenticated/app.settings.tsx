import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import "@/components/maal/settings/settings.css";

// Settings shell (redesign S5 — "Settings" Figma flow): Lora heading + tab row,
// child pages render in <Outlet/>. Sibling pages owned by other build agents
// (security, notifications, appearance, risk profile) are linked with plain
// hrefs so this file typechecks before their routes exist; the coordinator
// swaps them for typed <Link>s after integration.
export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsLayout,
});

type Tab = { to: string; label: string; typed?: boolean };

export const SETTINGS_TABS: Tab[] = [
  { to: "/app/settings", label: "All settings", typed: true },
  { to: "/app/settings/profile", label: "Profile", typed: true },
  { to: "/app/settings/security", label: "Security", typed: true },
  { to: "/app/settings/notifications", label: "Notifications", typed: true },
  { to: "/app/settings/appearance", label: "Appearance", typed: true },
  { to: "/app/settings/risk-profile", label: "Risk profile", typed: true },
];

function SettingsLayout() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "") || "/";
  const isActive = (to: string) => (to === "/app/settings" ? path === to : path === to || path.startsWith(to + "/"));

  return (
    <div className="mh ms mh-page">
      <div className="ms-head">
        <h1 className="mh-greeting">Settings</h1>
      </div>
      <nav className="ms-tabs" aria-label="Settings sections">
        {SETTINGS_TABS.map((t) => {
          const active = isActive(t.to);
          return t.typed ? (
            <Link key={t.to} to={t.to} className="mh-tab" data-active={active} aria-current={active ? "page" : undefined}>
              {t.label}
            </Link>
          ) : (
            <a key={t.to} href={t.to} className="mh-tab" data-active={active} aria-current={active ? "page" : undefined}>
              {t.label}
            </a>
          );
        })}
      </nav>
      <div className="ms-body">
        <Outlet />
      </div>
    </div>
  );
}
