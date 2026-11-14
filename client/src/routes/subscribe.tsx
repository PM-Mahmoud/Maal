import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/api";
import { SubscribeFlow, type SubscribePhase } from "@/components/maal/subscribe/SubscribeFlow";
import { snoozeDashboardOffer } from "@/components/maal/subscribe/offer";

// /subscribe — full-screen membership checkout (no app sidebar), and the page
// Stripe Checkout returns to (routes/billing.js, return_to=subscribe):
//   /subscribe                                   → plan + Subscribe
//   /subscribe?status=processing&session_id=…    → Payment processing → success
//   /subscribe?status=processing&demo=1          → dev/test demo (no Stripe key)
//   /subscribe?status=cancel | error&reason=…    → back on the plan with a note
//   /subscribe?preview=1                         → client-only walkthrough, no payment
//   from=onboarding|dashboard                    → where ✕ / "Not now" go back to

const searchSchema = z.object({
  status: z.enum(["processing", "cancel", "error"]).optional(),
  session_id: z.string().max(255).optional(),
  reason: z.string().max(40).optional(),
  demo: z.union([z.string(), z.number(), z.boolean()]).optional(),
  preview: z.union([z.string(), z.number(), z.boolean()]).optional(),
  from: z.enum(["onboarding", "dashboard", "billing"]).optional(),
});

export const Route = createFileRoute("/subscribe")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ href: "/login" });
  },
  component: SubscribePage,
});

function SubscribePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const initialPhase: SubscribePhase =
    search.status === "processing" ? "processing" : search.status === "cancel" ? "cancel" : search.status === "error" ? "error" : "offer";

  // "Maybe later" / ✕ counts as declining the offer: snooze the dashboard
  // offer overlay too, so Home doesn't ask again straight away.
  const leave = () => {
    snoozeDashboardOffer();
    if (search.from === "billing") window.location.assign("/app/billing");
    else navigate({ to: "/app" });
  };

  return (
    <SubscribeFlow
      initialPhase={initialPhase}
      sessionId={search.session_id ?? null}
      errorReason={search.reason ?? null}
      preview={["1", "true"].includes(String(search.preview))}
      onDone={() => navigate({ to: "/app" })}
      onBack={leave}
      onSkip={leave}
    />
  );
}
