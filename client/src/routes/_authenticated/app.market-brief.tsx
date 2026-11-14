import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MarketBriefStory } from "@/components/maal/briefs/MarketBriefStory";
import "@/components/maal/briefs/briefs.css";

export const Route = createFileRoute("/_authenticated/app/market-brief")({
  component: MarketBriefPage,
});

/** Deep link to the daily market brief story (also opened in place from Home). */
function MarketBriefPage() {
  const navigate = useNavigate();
  return (
    <div className="mb mb-page">
      <MarketBriefStory onClose={() => navigate({ to: "/app" })} />
    </div>
  );
}
