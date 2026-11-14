import { Link, useLocation } from "@tanstack/react-router";
import { areaFor, isActivePath } from "./sections";
import "./nav.css";

/** Tabs for the pages inside the current Track area (Spending, Invest, Forecast). */
export function SectionTabs() {
  const { pathname } = useLocation();
  const area = areaFor(pathname);
  if (!area || area.pages.length < 2) return null;
  // Most specific match wins (e.g. /app/invest vs /app/invest/…).
  const active = [...area.pages].sort((a, b) => b.to.length - a.to.length).find((p) => isActivePath(pathname, p.to));
  return (
    <nav className="mn-tabs" aria-label={`${area.label} pages`}>
      <span className="mn-tabs-title">{area.label}</span>
      <div className="mn-tabs-row">
        {area.pages.map((p) => (
          <Link key={p.to} to={p.to} className="mn-tab" data-active={active?.to === p.to}
            aria-current={active?.to === p.to ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
