import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { InviteFriendsCard } from "@/components/maal/app/InviteFriendsCard";
import {
  UserCircle2, Bell, BadgeCheck, Lock, Landmark, CircleDollarSign, Gauge, Palette, LifeBuoy, FileText,
  LogOut, Trash2, ChevronRight, Gift,
} from "lucide-react";
import { supabase } from "@/integrations/api";
import { OPEN_SUPPORT_EVENT } from "@/components/maal/app/AppShell";

// Settings menu (Figma "Settings" → Account menu): grouped Account /
// Preferences / Resources lists, invite offer on top, log out and delete at the
// foot. Links to routes other agents own are plain hrefs (see app.settings.tsx).
export const Route = createFileRoute("/_authenticated/app/settings/")({
  head: () => ({ meta: [{ title: "Settings · Maal" }] }),
  component: SettingsMenu,
});

// `typed` entries are routes in this branch (client-side <Link>); the rest are
// plain hrefs to pages owned elsewhere.
type Entry = { href: string; label: string; sub?: string; icon: ReactNode; typed?: boolean };

const ACCOUNT_ITEMS: Entry[] = [
  { href: "/app/settings/profile", label: "Profile", sub: "Name, contact details, address and tax details", icon: <UserCircle2 />, typed: true },
  { href: "/app/settings/notifications", label: "Notifications", icon: <Bell /> },
  { href: "/app/billing", label: "Membership", sub: "Your plan, billing and usage", icon: <BadgeCheck /> },
  { href: "/app/settings/security", label: "Security", sub: "Password and two-factor authentication", icon: <Lock /> },
  { href: "/app/accounts/connect", label: "Linked accounts", icon: <Landmark /> },
];

const PREFERENCE_ITEMS: Entry[] = [
  { href: "/app/spending/settings", label: "Spending settings", icon: <CircleDollarSign /> },
  { href: "/app/settings/risk-profile", label: "Risk profile", icon: <Gauge /> },
  { href: "/app/settings/appearance", label: "Appearance", sub: "Light or dark mode", icon: <Palette /> },
];

function Row({ entry }: { entry: Entry }) {
  const inner = (
    <>
      {entry.icon}
      <span>
        {entry.label}
        {entry.sub && <span className="ms-item-sub">{entry.sub}</span>}
      </span>
      <ChevronRight className="ms-item-chev" aria-hidden />
    </>
  );
  return entry.typed
    ? <Link to={entry.href} className="ms-item">{inner}</Link>
    : <a href={entry.href} className="ms-item">{inner}</a>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className="ms-group-label">{label}</h2>
      <div className="ms-list">{children}</div>
    </section>
  );
}

function SettingsMenu() {
  const navigate = useNavigate();
  const [showInvite, setShowInvite] = useState(false);
  async function logOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="ms-menu">
      <section aria-label="Special offer">
        <h2 className="ms-group-label">Special offer</h2>
        <button type="button" className="ms-offer w-full border-0 cursor-pointer text-left" aria-expanded={showInvite}
          onClick={() => setShowInvite((v) => !v)}>
          <Gift aria-hidden />
          <span>Refer 3 friends and renew for $4.99</span>
          <ChevronRight className="ms-item-chev" aria-hidden style={{ transform: showInvite ? "rotate(90deg)" : undefined }} />
        </button>
        {showInvite && <div className="mt-3"><InviteFriendsCard /></div>}
      </section>

      <Group label="Account">{ACCOUNT_ITEMS.map((e) => <Row key={e.href} entry={e} />)}</Group>
      <Group label="Preferences">{PREFERENCE_ITEMS.map((e) => <Row key={e.href} entry={e} />)}</Group>
      <Group label="Resources">
        <button type="button" className="ms-item" onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT))}>
          <LifeBuoy /><span>Support</span><ChevronRight className="ms-item-chev" aria-hidden />
        </button>
        <Row entry={{ href: "/app/vault", label: "Documents", sub: "Your Vault", icon: <FileText /> }} />
      </Group>

      <div className="ms-list">
        <button type="button" className="ms-item ms-item--danger" onClick={logOut}>
          <LogOut /><span>Log out</span><ChevronRight className="ms-item-chev" aria-hidden />
        </button>
        <Link to="/app/settings/delete-account" className="ms-item ms-item--danger">
          <Trash2 /><span>Delete account</span><ChevronRight className="ms-item-chev" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
