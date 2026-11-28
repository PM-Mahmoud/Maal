import { HomeCard } from "./HomeCard";
import { aud } from "./format";
import { usePrivacy } from "./prefs";

import type { HomeEstimates } from "./useHomeData";

const monthsFormat = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

export function HomeInsights({ estimates, loading, error }: {
  estimates: HomeEstimates | null;
  loading: boolean;
  error?: boolean;
}) {
  const privacy = usePrivacy();
  const runway = estimates?.cashRunwayMonths;
  const tax = estimates?.taxImpact;

  return (
    <>
      <HomeCard label="Cash runway" labelId="mh-runway-label">
        {error ? (
          <p className="mh-muted m-0">Cash runway couldn’t load.</p>
        ) : loading ? (
          <div className="mh-skel h-12" aria-label="Loading cash runway" />
        ) : runway == null ? (
          <p className="mh-muted m-0">Add a cash balance and recent spending to see your cash runway.</p>
        ) : (
          <>
            <p className="mh-amount m-0 text-3xl" aria-hidden={privacy || undefined}>
              {monthsFormat.format(runway)} {runway === 1 ? "month" : "months"}
            </p>
            <p className="mh-muted mh-small mb-0 mt-2">Based on your cash balance and the past 30 days of spending.</p>
          </>
        )}
      </HomeCard>
      <HomeCard label="Tax impact" labelId="mh-tax-impact-label">
        {error ? (
          <p className="mh-muted m-0">Tax impact couldn’t load.</p>
        ) : loading ? (
          <div className="mh-skel h-12" aria-label="Loading tax impact" />
        ) : tax?.total == null ? (
          <p className="mh-muted m-0">Add your annual income to see an indicative tax estimate.</p>
        ) : (
          <>
            <p className="mh-muted mh-small m-0">Indicative FY {tax.fiscalYear.replace("-", "–")} estimate</p>
            <p className="mh-amount mt-2 mb-0 text-3xl" aria-hidden={privacy || undefined}>{aud(tax.total)}</p>
            <p className="mh-muted mh-small mb-0 mt-2">
              Includes income tax, Medicare levy and any HELP repayment. Educational estimate only.
            </p>
          </>
        )}
      </HomeCard>
    </>
  );
}
