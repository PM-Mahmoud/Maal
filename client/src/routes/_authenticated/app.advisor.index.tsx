import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdvisorWorkspace } from "@/components/maal/advisor/AdvisorWorkspace";

export const Route = createFileRoute("/_authenticated/app/advisor/")({
  component: AdvisorIndex,
});

// Advisor workspace with no chat selected: welcome + suggested questions. The
// chat is created on the first message (no empty "New chat" rows).
function AdvisorIndex() {
  const navigate = useNavigate();
  return (
    <AdvisorWorkspace
      variant="page"
      activeId={null}
      onSelect={(id) => {
        if (id) navigate({ to: "/app/advisor/$threadId", params: { threadId: id } });
      }}
    />
  );
}
