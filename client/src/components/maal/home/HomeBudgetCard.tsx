import { Link } from "@tanstack/react-router";
import type { HomeBudgetSummary } from "../../../../../shared/home-budget.mjs";
import { catColour, useCustomColours } from "../spending/categoryColour";
import { aud } from "./format";
import { HomeCard } from "./HomeCard";
import { usePrivacy } from "./prefs";
import "./home-budget.css";

const monthFormat = new Intl.DateTimeFormat("en-AU", { month: "long" });
const breakdownSearch = { tab: "budget" as const };

export function HomeBudgetCard({ budget, loading, error }: {
  budget: HomeBudgetSummary | null;
  loading: boolean;
  error?: boolean;
}) {
  const privacy = usePrivacy();
  const colours = useCustomColours();
  const percent = budget ? Math.round((budget.spent / budget.budget) * 100) : 0;

  return (
    <HomeCard label={`Budget in ${monthFormat.format(new Date())}`} labelId="mh-home-budget" className="mh-home-budget">
      {loading ? (
        <div className="mh-skel h-16" aria-label="Loading budget" />
      ) : error ? (
        <p className="mh-muted m-0">Your budget couldn’t load right now.</p>
      ) : budget ? (
        <>
          <p className="mh-home-budget-summary m-0" aria-hidden={privacy || undefined}>
            <span className="mh-amount mh-home-budget-value">{aud(budget.spent)}</span>
            <span className="mh-muted">spent of <span className="mh-amount">{aud(budget.budget)}</span></span>
          </p>
          <div className="mh-home-budget-progress" aria-hidden={privacy || undefined}>
            <span className="mh-bar">
              <i style={{ width: `${Math.min(100, percent)}%` }} data-over={budget.spent > budget.budget} />
            </span>
            <span className="mh-muted mh-amount">{percent}%</span>
          </div>
          {budget.overBudget.length > 0 && (
            <>
              <h3 className="mh-home-budget-heading">Most over budget</h3>
              <ul className="mh-home-budget-list">
                {budget.overBudget.map(({ group, over }) => (
                  <li key={group}>
                    <i aria-hidden style={{ background: catColour(group, colours) }} />
                    <span>{group}</span>
                    <span className="mh-amount" aria-hidden={privacy || undefined}>{aud(over)} over</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link to="/app/spending/breakdown" search={breakdownSearch} className="mh-home-budget-link">Breakdown and budget</Link>
        </>
      ) : (
        <>
          <p className="mh-muted m-0">Set a monthly budget to see how your spending tracks against it.</p>
          <Link to="/app/spending/breakdown" search={{ ...breakdownSearch, panel: "edit" }} className="mh-btn-ink mt-4">Set a budget</Link>
        </>
      )}
    </HomeCard>
  );
}
