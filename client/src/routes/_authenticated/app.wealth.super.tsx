import { createFileRoute } from "@tanstack/react-router";
import { WealthPortfolioPage } from "./app.assets";

export const Route = createFileRoute("/_authenticated/app/wealth/super")({ component: () => <WealthPortfolioPage section="super" /> });
