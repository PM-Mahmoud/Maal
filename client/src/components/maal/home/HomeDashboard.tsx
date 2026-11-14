import { useMemo } from "react";
import { AskMaalTile } from "@/components/maal/dashboard/AskMaalTile";
import { CompleteOnboardingCard, DashboardOffer } from "@/components/maal/subscribe";
import { HomeBriefCards } from "@/components/maal/briefs";
import { filteredTotals } from "../../../../../shared/home-accounts.mjs";
import { HomeHeader } from "./HomeHeader";
import { NetWorthCard } from "./NetWorthCard";
import { SpendingCard } from "./SpendingCard";
import { InvestmentsCard } from "./InvestmentsCard";
import { MaalScoreCard, MarketWatchCard } from "./SideCards";
import { useHomeData } from "./useHomeData";
import "./home.css";

/**
 * Home (Figma: Home / privacy / hide graph / filter accounts flows).
 * Left: net worth, spending, investments, Ask Maal. Right: setup guide,
 * partner offer, weekly recap + market brief, Maal Score, market watch.
 */
export function HomeDashboard() {
  const data = useHomeData();
  const totals = useMemo(() => filteredTotals(data.accounts, null), [data.accounts]);

  return (
    <div className="mh">
      {/* Membership offer overlay (trial users only; never stacks with the paywall). */}
      <DashboardOffer />
      <div className="mh-page">
        <HomeHeader name={data.name} />
        <div className="mh-grid">
          <div className="mh-col">
            <NetWorthCard
              accounts={data.accounts}
              snapshots={data.snapshots}
              loading={data.loading}
              error={data.errors.accounts}
              onRefresh={() => void data.reload()}
            />
            <SpendingCard transactions={data.transactions} loading={data.loading} error={data.errors.transactions} />
            <InvestmentsCard total={totals.investments} snapshots={data.snapshots} rows={data.investmentRows} loading={data.loading} />
            <AskMaalTile />
          </div>
          <aside className="mh-col" aria-label="Insights">
            {/* Figma "Complete onboarding": the green setup card + its dialog. */}
            <CompleteOnboardingCard />
            <HomeBriefCards />
            <MaalScoreCard score={data.score} error={data.errors.score} />
            <MarketWatchCard />
          </aside>
        </div>
      </div>
    </div>
  );
}
