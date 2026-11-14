import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WeeklyRecapStory } from "@/components/maal/briefs/WeeklyRecapStory";
import "@/components/maal/briefs/briefs.css";

export const Route = createFileRoute("/_authenticated/app/recap")({
  component: RecapPage,
});

/** Deep link to the weekly recap story (also opened in place from Home). */
function RecapPage() {
  const navigate = useNavigate();
  return (
    <div className="mb mb-page">
      <WeeklyRecapStory onClose={() => navigate({ to: "/app" })} />
    </div>
  );
}
