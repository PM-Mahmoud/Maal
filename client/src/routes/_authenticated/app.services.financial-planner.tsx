import { createFileRoute } from "@tanstack/react-router";
import { ServicePage } from "@/components/maal/nav/ServicePage";

export const Route = createFileRoute("/_authenticated/app/services/financial-planner")({ component: FinancialPlanner });

function FinancialPlanner() {
  return (
    <ServicePage
      title="Financial planner"
      lead="Talk to a licensed Australian financial adviser when you want personal advice, with your Maal plan and numbers ready to share."
      points={[
        "Personal advice from an adviser on the Financial Advisers Register",
        "Your goals, net worth and plan shared with your consent",
        "Profit-based strategies by default",
      ]}
      interestKey="financial-planner"
      today={[
        { to: "/app/planning", title: "Build your financial plan", text: "Turn your goals, cash and debts into a monthly plan." },
        { to: "/app/advisor", title: "Ask Maal", text: "Get general information about your situation, any time." },
        { to: "/app/action-plan", title: "Follow your action plan", text: "Work through your next steps one at a time." },
      ]}
    />
  );
}
