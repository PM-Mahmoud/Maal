import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdvisorWorkspace } from "@/components/maal/advisor/AdvisorWorkspace";

export const Route = createFileRoute("/_authenticated/app/advisor/$threadId")({
  component: ThreadPage,
});

// A single chat inside the advisor workspace. Conversation behaviour (stop,
// draft autosave, voice input, download, widgets + Add to Dashboard, follow-up
// chips, citations, usage-limit upgrade prompt) lives in ChatConversation.
function ThreadPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <AdvisorWorkspace
      variant="page"
      activeId={threadId}
      onSelect={(id) => {
        if (id) navigate({ to: "/app/advisor/$threadId", params: { threadId: id } });
        else navigate({ to: "/app/advisor" });
      }}
    />
  );
}
