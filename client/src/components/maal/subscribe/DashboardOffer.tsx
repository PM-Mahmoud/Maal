import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getUsage, type Usage } from "@/lib/usage.functions";
import { FALLBACK_OFFER, fetchOffer, type Offer } from "./offer";
import { TermsNote } from "./SubscribeFlow";
import "./subscribe.css";

// DashboardOffer — Figma "Subscribing to a plan", frame 01 "Dashboard offer":
// a night-sky card over the dashboard offering membership at the first-year
// price. "Join today" opens the full-screen SubscribeFlow at /subscribe.
//
// Self-contained: by default it loads /api/v1/usage and only shows for a user
// who is NOT a paying member and whose trial is still running (the expired-
// trial paywall is MembershipGate's job, so the two never stack). Dismissing
// hides it for SNOOZE_DAYS (per browser).
//
// Usage (dashboard): <DashboardOffer />
// Controlled:        <DashboardOffer open={show} onClose={() => setShow(false)} />

const SNOOZE_KEY = "maal_offer_snoozed_until";
const SNOOZE_DAYS = 3;

export type DashboardOfferProps = {
  /** Force open/closed. When omitted, the component decides from usage + snooze. */
  open?: boolean;
  /** Called after the user closes it (also snoozes it when uncontrolled). */
  onClose?: () => void;
  /** Override "Join today". Default: go to /subscribe?from=dashboard. */
  onJoin?: () => void;
  /** Pass usage if the parent already loaded it (skips the fetch). */
  usage?: Usage | null;
};

export function DashboardOffer({ open, onClose, onJoin, usage: usageProp }: DashboardOfferProps) {
  const controlled = open !== undefined;
  const [usage, setUsage] = useState<Usage | null | undefined>(usageProp);
  const [offer, setOffer] = useState<Offer>(FALLBACK_OFFER);
  const [snoozed, setSnoozed] = useState(true);
  const [closed, setClosed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    void fetchOffer().then(setOffer);
    if (controlled) return;
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      setSnoozed(until > Date.now());
    } catch { setSnoozed(false); }
    if (usageProp === undefined) getUsage().then(setUsage).catch(() => setUsage(null));
  }, [controlled, usageProp]);

  useEffect(() => { if (usageProp !== undefined) setUsage(usageProp); }, [usageProp]);

  const eligible = !!usage && !usage.paid && !usage.paywalled && !!usage.trial?.active;
  const visible = controlled ? open : eligible && !snoozed && !closed;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close() {
    if (!controlled) {
      setClosed(true);
      try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)); } catch { /* ignore */ }
    }
    onClose?.();
  }

  function join() {
    if (onJoin) return onJoin();
    window.location.assign("/subscribe?from=dashboard");
  }

  if (!visible) return null;

  const daysLeft = usage?.trial?.daysLeft;

  return (
    <div className="msub ms-modal" role="dialog" aria-modal="true" aria-labelledby="ms-offer-price" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="ms-offer ms-sky">
        <button type="button" className="ms-offer-close" onClick={close} aria-label="Close offer">
          <X className="size-5" strokeWidth={1.6} />
        </button>
        <p className="ms-offer-kicker">
          {daysLeft ? `Join Maal today · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial` : "Join Maal today"}
        </p>
        <span className="ms-offer-badge">Limited time offer · {offer.discountPercent}% off</span>
        <h2 id="ms-offer-price" className="ms-offer-price">{offer.firstYear}</h2>
        <p className="ms-offer-per">for your first year</p>
        <p className="ms-offer-renew">Renews at {offer.renewal}/year (incl. GST). Cancel anytime in Plan &amp; Usage.</p>
        <div className="ms-offer-cta">
          <button type="button" className="ms-btn ms-btn-light" onClick={join}>Join today</button>
        </div>
        <p className="ms-offer-terms">
          <button type="button" className="ms-link" style={{ color: "#C1DDE8", fontSize: 14 }} aria-expanded={termsOpen} onClick={() => setTermsOpen((o) => !o)}>
            Terms apply
          </button>
        </p>
        {termsOpen && <TermsNote offer={offer} dark />}
      </div>
    </div>
  );
}
