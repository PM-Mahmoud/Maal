import { Link, useRouter } from "@tanstack/react-router";
import { Gift, HelpCircle, Plus, Settings } from "lucide-react";
import { NotificationBell } from "@/components/maal/app/NotificationBell";
import { OPEN_SUPPORT_EVENT } from "@/components/maal/app/AppShell";
import { CONNECT_PATH } from "./NetWorthCard";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function initials(name: string) {
  const parts = name.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Greeting, Overview / Net worth tabs and the round action buttons. */
export function HomeHeader({ name }: { name: string }) {
  const router = useRouter();
  const first = name ? name.split(/\s+/)[0] : "";
  const display = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  return (
    <header>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="mh-greeting">{greeting()}{display ? `, ${display}` : ""}</h1>
        <div className="flex items-center gap-2.5">
          <Link to="/app/billing" hash="invite" className="mh-iconbtn mh-iconbtn--gift hidden sm:inline-grid" aria-label="Invite friends" title="Invite friends">
            <Gift aria-hidden />
          </Link>
          <Link to="/app/onboarding" className="mh-iconbtn mh-iconbtn--avatar" aria-label="Your profile" title="Your profile">
            {initials(name) || "Me"}
          </Link>
          <button type="button" className="mh-iconbtn" onClick={() => router.history.push(CONNECT_PATH)} aria-label="Add account" title="Add account">
            <Plus aria-hidden />
          </button>
          <span className="hidden md:inline-flex"><NotificationBell /></span>
          <button type="button" className="mh-iconbtn hidden sm:inline-grid" onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT))}
            aria-label="Help and support" title="Help and support">
            <HelpCircle aria-hidden />
          </button>
          <Link to="/app/billing" className="mh-iconbtn" aria-label="Plan and settings" title="Plan and settings">
            <Settings aria-hidden />
          </Link>
        </div>
      </div>
      <nav className="mh-tabs" aria-label="Home views">
        <Link to="/app" className="mh-tab" data-active="true" aria-current="page">Overview</Link>
        <Link to="/app/assets" search={{ add: undefined }} className="mh-tab">Net worth</Link>
      </nav>
    </header>
  );
}
