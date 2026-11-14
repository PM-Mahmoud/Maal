import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import "./nav.css";

export type ServiceLink = { to: string; title: string; text: string };

/**
 * Shared layout for the Services pages (brokerage, estate planning, tax,
 * financial planner) and Equity. These services are delivered through licensed
 * Australian partners; until a partner is live the page explains the service,
 * links to what Maal already does today, and records interest.
 */
export function ServicePage({ kicker = "Coming soon", title, lead, points, today, interestKey, children }: {
  kicker?: string;
  title: string;
  lead: string;
  points: string[];
  today: ServiceLink[];
  interestKey: string;
  children?: ReactNode;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function registerInterest() {
    setState("sending");
    try {
      const r = await fetch("/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `[service-interest] ${interestKey}`, page: window.location.pathname }),
      });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mn-page">
      <span className="mn-kicker">{kicker}</span>
      <h1 className="mn-h1">{title}</h1>
      <p className="mn-lead">{lead}</p>
      <ul className="mn-list">{points.map((p) => <li key={p}>{p}</li>)}</ul>
      <div className="mn-actions">
        <button type="button" className="mn-btn" onClick={registerInterest} disabled={state === "sending" || state === "done"}>
          {state === "done" ? "You're on the list" : state === "sending" ? "Saving…" : "Notify me when it's ready"}
        </button>
        {state === "done" && <span className="mn-note" role="status">Thanks — we'll let you know when it opens.</span>}
        {state === "error" && <span className="mn-note" role="alert">Couldn't save that. Please try again.</span>}
      </div>

      {children}

      {today.length > 0 && (
        <section className="mn-section">
          <h2>What you can do in Maal today</h2>
          <div className="mn-grid">
            {today.map((t) => (
              <div key={t.to} className="mn-card">
                <h3>{t.title}</h3>
                <p>{t.text}</p>
                <Link to={t.to} className="mn-link">Open →</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mn-disclaimer">
        Maal does not provide financial advice. Any information provided by Maal is for educational purposes only.
        You should do your own research. Investing is risky and you can lose all of your money.
      </p>
    </div>
  );
}
