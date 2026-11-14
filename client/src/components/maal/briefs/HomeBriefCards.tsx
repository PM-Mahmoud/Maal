import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { briefKeys, getMarketBrief, getWeeklyRecap } from "./api";
import { WeeklyRecapStory } from "./WeeklyRecapStory";
import { MarketBriefStory } from "./MarketBriefStory";
import "./briefs.css";

type BriefId = "recap" | "market";

function dismissKey(id: BriefId, period: string) {
  return `maal_brief_dismissed:${id}:${period}`;
}
function isDismissed(id: BriefId, period: string | undefined) {
  if (!period) return false;
  try { return localStorage.getItem(dismissKey(id, period)) === "1"; } catch { return false; }
}

function EntryCard({
  kicker,
  title,
  subtitle,
  onOpen,
  onDismiss,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  onOpen: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="mb-entry">
      <button type="button" onClick={onOpen} className="mb-entry-open" aria-label={`Open ${title}: ${subtitle}`}>
        <div className="mb-entry-head"><span>{kicker}</span></div>
        <div className="mb-entry-body">
          <p className="mb-entry-title">{title}</p>
          <p className="mb-entry-sub">{subtitle}</p>
        </div>
      </button>
      {onDismiss ? (
        <button type="button" className="mb-entry-close" onClick={onDismiss} aria-label={`Hide ${title}`}>
          <X size={18} strokeWidth={1.6} />
        </button>
      ) : null}
    </div>
  );
}

/** Home entry cards for the weekly recap and daily market brief (Figma: the
 *  "Personal recap" cards in the Home right column). Clicking a card opens its
 *  story over the page. A card hidden with × stays hidden for that week/day.
 *
 *  Usage: <HomeBriefCards />  or  <HomeBriefCards show={["market"]} /> */
export function HomeBriefCards({ show = ["recap", "market"], className }: { show?: BriefId[]; className?: string }) {
  const [open, setOpen] = useState<BriefId | null>(null);
  const [, force] = useState(0);
  const recap = useQuery({ queryKey: briefKeys.recap, queryFn: getWeeklyRecap, staleTime: 10 * 60 * 1000, enabled: show.includes("recap") });
  const market = useQuery({ queryKey: briefKeys.market, queryFn: getMarketBrief, staleTime: 30 * 60 * 1000, enabled: show.includes("market") });

  const recapPeriod = recap.data?.period?.start;
  const marketPeriod = market.data?.date;

  function dismiss(id: BriefId, period: string | undefined) {
    if (!period) return;
    try { localStorage.setItem(dismissKey(id, period), "1"); } catch { /* ignore */ }
    force((n) => n + 1);
  }

  const cards = [];
  if (show.includes("recap") && !isDismissed("recap", recapPeriod)) {
    cards.push(
      <EntryCard
        key="recap"
        kicker="Personal recap"
        title="Your weekly recap"
        subtitle={recap.data?.period?.longLabel ? recap.data.period.longLabel : recap.isError ? "Your last seven days, summarised" : "Loading your week…"}
        onOpen={() => setOpen("recap")}
        onDismiss={recapPeriod ? () => dismiss("recap", recapPeriod) : undefined}
      />,
    );
  }
  if (show.includes("market") && !isDismissed("market", marketPeriod)) {
    cards.push(
      <EntryCard
        key="market"
        kicker="Market brief"
        title="Daily market brief"
        subtitle={market.data?.headline ? market.data.headline : "ASX, the Aussie dollar and global markets, explained"}
        onOpen={() => setOpen("market")}
        onDismiss={marketPeriod ? () => dismiss("market", marketPeriod) : undefined}
      />,
    );
  }

  return (
    <div className={`mb${className ? ` ${className}` : ""}`}>
      {cards.length ? <div className="mb-entries">{cards}</div> : null}
      {open === "recap" ? <WeeklyRecapStory onClose={() => setOpen(null)} /> : null}
      {open === "market" ? <MarketBriefStory onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
