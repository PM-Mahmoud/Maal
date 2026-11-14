import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { ConnectAccountsFlow, type ConnectResult } from "@/components/maal/connect/ConnectAccountsFlow";

// /app/accounts/connect — in-app "Add account" (Figma add-account flow).
// Link here from anywhere: <Link to="/app/accounts/connect" />, or
// ?start=manual to open straight on manual accounts and assets.
// Closing or finishing returns to the dashboard.

const searchSchema = z.object({
  start: z.enum(["choose", "manual"]).optional(),
});

export const Route = createFileRoute("/_authenticated/app/accounts/connect")({
  component: ConnectAccountsPage,
  validateSearch: searchSchema,
});

function ConnectAccountsPage() {
  const navigate = useNavigate();
  const { start } = Route.useSearch();

  const done = (result: ConnectResult) => {
    if (result.source === "manual") toast.success("Success", { description: "Your asset was created." });
    else if (result.source === "basiq") toast.success("Your account is now connected", { description: "All data will refresh automatically within the next few minutes." });
    navigate({ to: "/app" });
  };

  return (
    <div style={{ minHeight: "60vh" }}>
      <ConnectAccountsFlow
        mode="app"
        initialStep={start ?? "choose"}
        onDone={done}
        onClose={() => navigate({ to: "/app" })}
      />
    </div>
  );
}
