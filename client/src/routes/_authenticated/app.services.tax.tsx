import { createFileRoute } from "@tanstack/react-router";
import { ServicePage } from "@/components/maal/nav/ServicePage";

export const Route = createFileRoute("/_authenticated/app/services/tax")({ component: Tax });

function Tax() {
  return (
    <ServicePage
      title="Tax"
      lead="Get tax time sorted with a registered Australian tax agent, using the receipts and figures already in Maal."
      points={[
        "Lodge your return with a registered tax agent",
        "Deductions pulled together from your categorised transactions",
        "HECS-HELP, super contributions and Medicare levy taken into account",
      ]}
      interestKey="tax"
      today={[
        { to: "/app/transactions", title: "Categorise your spending", text: "Tag work-related expenses as you go so tax time is quicker." },
        { to: "/app/vault", title: "Keep your receipts", text: "Upload receipts, PAYG summaries and statements to your Vault." },
        { to: "/app/advisor", title: "Ask Maal", text: "Ask how a tax rule works, using the current financial year's ATO figures." },
      ]}
    />
  );
}
