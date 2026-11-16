import { createFileRoute } from "@tanstack/react-router";
import { WealthPortfolioPage } from "@/components/maal/wealth/WealthPortfolioPage";

export const Route = createFileRoute("/_authenticated/app/assets")({
  validateSearch: (search: Record<string, unknown>) => ({
    add: search.add === "asset" || search.add === "liability" ? search.add : undefined,
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { add } = Route.useSearch();
  return <WealthPortfolioPage initialAdd={add === "asset" || add === "liability" ? add : undefined} />;
}
