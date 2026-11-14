import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMarketplace } from "@/lib/wealth-services.functions";
import "@/components/maal/nav/nav.css";

export const Route = createFileRoute("/_authenticated/app/invest")({ component: InvestOverview });

type Offering = { partnerKey: string; name: string; sponsored?: boolean; scopes: string[] };
type Marketplace = { enabled?: boolean; offerings?: Offering[] };

const AREAS = [
  { to: "/app/wealth/investments", title: "Investments", text: "Shares, ETFs and managed funds from any broker." },
  { to: "/app/wealth/super", title: "Super", text: "Your super balances, contributions and fund details." },
  { to: "/app/wealth/property", title: "Property", text: "Your home and investment properties." },
  { to: "/app/wealth/other", title: "Other assets", text: "Vehicles, valuables, gold and everything else." },
  { to: "/app/portfolio-plan", title: "Portfolio plan", text: "A diversified mix that matches your age and risk." },
  { to: "/app/research", title: "Research", text: "Sourced summaries of companies and markets." },
];

/**
 * Invest overview. Profit-based products from Maal's partners appear here
 * (read-only, display and link out only — Maal never moves money). Partners
 * are configured and approved through the partner platform
 * (services/wealth-services-api.js); none is named in code.
 */
function InvestOverview() {
  const [market, setMarket] = useState<Marketplace | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMarketplace().then((d: Marketplace) => setMarket(d)).catch(() => setFailed(true));
  }, []);

  const offerings = market?.enabled ? market.offerings ?? [] : [];

  return (
    <div className="mn-page">
      <h1 className="mn-h1">Invest</h1>
      <p className="mn-lead">Everything you own that grows, in one place, plus profit-based products from our licensed partners.</p>

      <section className="mn-section">
        <h2>Profit-based products</h2>
        <p className="mn-note">Interest-free ways to save and invest, shown with your consent. Read-only: Maal shows balances and products and never moves your money.</p>
        {offerings.length > 0 ? (
          <div className="mn-grid">
            {offerings.map((o) => (
              <div key={o.partnerKey} className="mn-card">
                <h3>{o.name}</h3>
                {o.sponsored && <p className="mn-note">Sponsored relationship</p>}
                <p>Shares with your consent: {o.scopes.join(", ") || "nothing yet"}.</p>
                <p className="mn-note" style={{ marginTop: 10 }}>Connecting your account is coming soon.</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mn-card" style={{ marginTop: 16 }}>
            <h3>{failed ? "Couldn't load partner products" : "Coming soon"}</h3>
            <p>
              {failed
                ? "Please refresh the page to try again."
                : "Our first profit-based partner is being connected. When it's ready you'll be able to link your account here and see your balance alongside the rest of your wealth."}
            </p>
          </div>
        )}
      </section>

      <section className="mn-section">
        <h2>Your investments</h2>
        <div className="mn-grid">
          {AREAS.map((a) => (
            <div key={a.to} className="mn-card">
              <h3>{a.title}</h3>
              <p>{a.text}</p>
              <Link to={a.to} className="mn-link">Open →</Link>
            </div>
          ))}
        </div>
      </section>

      <p className="mn-disclaimer">
        Maal does not provide financial advice. Any information provided by Maal is for educational purposes only.
        You should do your own research. Investing is risky and you can lose all of your money.
      </p>
    </div>
  );
}
