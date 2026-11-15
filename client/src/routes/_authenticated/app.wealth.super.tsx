import { createFileRoute } from "@tanstack/react-router";
import { WealthPortfolioPage } from "@/components/maal/wealth/WealthPortfolioPage";

export const Route = createFileRoute("/_authenticated/app/wealth/super")({ component: () => <WealthPortfolioPage section="super" /> });
