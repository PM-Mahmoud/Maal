import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Gauge, PieChart, Receipt, Sparkles, Sprout, X } from "lucide-react";
import { MaalMark } from "@/components/maal/MaalMark";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { FALLBACK_OFFER, fetchOffer, type Offer } from "./offer";
import { PaymentStatusOverlay, usePaymentPolling } from "./PaymentStatus";
import "./subscribe.css";

// SubscribeFlow — Figma "Subscribing to a plan": Subscribe (frame 02) →
// Payment processing (03) → Payment success (04).
//
// Wired to the real billing: "Subscribe" posts to /billing/checkout with
// plan=member and return_to=subscribe, so Stripe Checkout (test mode) sends
// the user back to /subscribe?status=processing&session_id=…, where this
// component polls /billing/status until the plan is active. Card details are
// only ever entered on Stripe's own page.
//
// Without STRIPE_SECRET_KEY the server's dev/test demo grants the plan and
// redirects to ?status=processing&demo=1, and `preview` walks every screen
// client-side with no network at all (visual review / Storybook-style).

export type SubscribePhase = "offer" | "processing" | "success" | "cancel" | "error";

export type SubscribeFlowProps = {
  /** Called once the membership is confirmed (after the success screen). */
  onDone: () => void;
  /** Close / back (the ✕ on the sky panel). Hidden when omitted. */
  onBack?: () => void;
  /** "Not now" — carry on with the free trial. Hidden when omitted. */
  onSkip?: () => void;
  /** Which screen to start on (the route maps ?status= to this). */
  initialPhase?: SubscribePhase;
  /** Stripe Checkout session id from the return URL. */
  sessionId?: string | null;
  /** Error code from the return URL: "config" | "stripe". */
  errorReason?: string | null;
  /** Client-only walkthrough: Subscribe → processing → success, no payment. */
  preview?: boolean;
};

const BENEFITS: { icon: ReactNode; label: string }[] = [
  { icon: <PieChart className="size-[17px]" strokeWidth={1.6} />, label: "Spending & budget tracking" },
  { icon: <BarChart3 className="size-[17px]" strokeWidth={1.6} />, label: "Net worth & portfolio tracking" },
  { icon: <Sparkles className="size-[17px]" strokeWidth={1.6} />, label: "Ask Maal anything about your money" },
  { icon: <Gauge className="size-[17px]" strokeWidth={1.6} />, label: "Your Maal Score & action plan" },
  { icon: <Sprout className="size-[17px]" strokeWidth={1.6} />, label: "Profit-based options from partners" },
  { icon: <Receipt className="size-[17px]" strokeWidth={1.6} />, label: "Tax & super tools" },
];

export function SubscribeFlow({ onDone, onBack, onSkip, initialPhase = "offer", sessionId, errorReason, preview }: SubscribeFlowProps) {
  const [offer, setOffer] = useState<Offer>(FALLBACK_OFFER);
  const [phase, setPhase] = useState<SubscribePhase>(initialPhase);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { void fetchOffer().then(setOffer); }, []);
  useEffect(() => { setPhase(initialPhase); }, [initialPhase]);

  const paying = phase === "processing" || phase === "success";
  const polling = usePaymentPolling({ sessionId, preview, enabled: phase === "processing" });
  useEffect(() => { if (polling.phase === "success" && phase === "processing") setPhase("success"); }, [polling.phase, phase]);

  const overlayPhase = phase === "success" ? "success" : polling.phase;

  return (
    <div className="msub ms-page">
      <div className={`ms-split ${paying ? "ms-blur" : ""}`} aria-hidden={paying || undefined} inert={paying || undefined}>
        <PlanCard
          offer={offer}
          phase={phase}
          errorReason={errorReason}
          submitting={submitting}
          preview={preview}
          onSubmitStart={() => setSubmitting(true)}
          onPreviewSubscribe={() => setPhase("processing")}
          onBack={onBack}
          onSkip={onSkip}
        />
        <SkyPanel onBack={onBack} />
      </div>

      {paying && (
        <PaymentStatusOverlay
          phase={overlayPhase}
          progress={polling.progress}
          onDone={onDone}
          onRetry={polling.retry}
          onBackToPlan={() => { setSubmitting(false); setPhase("offer"); }}
        />
      )}
    </div>
  );
}

function PlanCard({ offer, phase, errorReason, submitting, preview, onSubmitStart, onPreviewSubscribe, onBack, onSkip }: {
  offer: Offer;
  phase: SubscribePhase;
  errorReason?: string | null;
  submitting: boolean;
  preview?: boolean;
  onSubmitStart: () => void;
  onPreviewSubscribe: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <section className="ms-plan" aria-labelledby="ms-plan-price">
      {onBack && (
        <button type="button" className="ms-plan-close" onClick={onBack} aria-label="Close">
          <X className="size-5" strokeWidth={1.6} />
        </button>
      )}
      <span className="ms-logo"><MaalMark size={30} /></span>
      <span className="ms-badge">Limited time offer · {offer.discountPercent}% off</span>
      <h1 id="ms-plan-price" className="ms-price">{offer.firstYear}</h1>
      <p className="ms-per">for your first year</p>
      <p className="ms-renews">Then {offer.renewal}/year. Cancel anytime. Prices in AUD, incl. GST.</p>

      <ul className="ms-benefits" aria-label="What's included">
        {BENEFITS.map((b) => <li key={b.label}>{b.icon}<span>{b.label}</span></li>)}
      </ul>

      <button type="button" className="ms-link ms-link-soft ms-terms" aria-expanded={termsOpen} onClick={() => setTermsOpen((o) => !o)}>
        Terms apply
      </button>
      {termsOpen && <TermsNote offer={offer} />}

      {phase === "cancel" && <p className="ms-alert ms-alert-info" role="status">Checkout was cancelled, so nothing was charged.</p>}
      {phase === "error" && (
        <p className="ms-alert" role="alert">
          {errorReason === "config"
            ? "Payments aren't fully set up yet, so checkout couldn't start. Nothing was charged."
            : "We couldn't start checkout just now. Nothing was charged, please try again shortly."}
        </p>
      )}

      <div className="ms-actions">
        {preview ? (
          <button type="button" className="ms-btn ms-btn-ink" onClick={onPreviewSubscribe}>
            Subscribe for {offer.firstYear}
          </button>
        ) : (
          <form method="post" action="/billing/checkout" onSubmit={onSubmitStart}>
            <input type="hidden" name="plan" value="member" />
            <input type="hidden" name="return_to" value="subscribe" />
            <button type="submit" className="ms-btn ms-btn-ink" disabled={submitting}>
              {submitting ? "Opening secure checkout…" : `Subscribe for ${offer.firstYear}`}
            </button>
          </form>
        )}
        {onSkip && (
          <button type="button" className="ms-btn ms-btn-line" onClick={onSkip}>
            Maybe later
          </button>
        )}
      </div>

      <div className="ms-fine">
        <span>Secure checkout by Stripe. Maal never sees your card details.</span>
        <span>Your {offer.trialDays}-day free trial needs no card.</span>
      </div>

      <div className="ms-disclaimer"><Disclaimer variant="inline" /></div>
    </section>
  );
}

/** "Terms apply" — the auto-renewal terms, shown next to the price (ACL). */
export function TermsNote({ offer, dark }: { offer: Offer; dark?: boolean }) {
  const gst = (c: number) => "$" + (c / 100).toFixed(2);
  return (
    <p className={dark ? "ms-offer-renew" : "ms-alert ms-alert-info"} style={dark ? { fontSize: 13, opacity: 0.85, maxWidth: 520, margin: "12px auto 0" } : undefined}>
      The {offer.firstYear} first-year price (incl. {gst(offer.firstYearGstCents)} GST) is for new members. Your membership then renews
      automatically each year at {offer.renewal} (incl. {gst(offer.renewalGstCents)} GST) unless you cancel in Plan &amp; Usage before
      the renewal date. All prices in Australian dollars.
    </p>
  );
}

/** Right-hand sky panel (frame 02 "Wealth overview"), desktop only. */
function SkyPanel({ onBack }: { onBack?: () => void }) {
  return (
    <aside className="ms-hero ms-sky" aria-label="About Maal membership" style={{ position: "relative" }}>
      {onBack && (
        <button type="button" className="ms-hero-close" onClick={onBack} aria-label="Close">
          <X className="size-6" strokeWidth={1.4} />
        </button>
      )}
      <h2>See every dollar clearly.<br />Grow it with confidence.</h2>
      <p className="ms-trust"><span>Australian-built</span><i /><span>Read-only open banking</span></p>
      <SampleSpendCard />
    </aside>
  );
}

function SampleSpendCard() {
  return (
    <div className="ms-chart-card" aria-hidden="true">
      <div className="ms-chart-head">
        <span className="ms-chart-label">Spent this month</span>
        <span className="ms-chart-ai"><Sparkles className="size-3.5" strokeWidth={1.8} /></span>
      </div>
      <p className="ms-chart-value">$2,132</p>
      <p className="ms-chart-legend">November</p>
      <svg className="ms-chart-svg" viewBox="0 0 434 112" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ms-spend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity=".04" />
          </linearGradient>
        </defs>
        <path d="M0 104 C70 102 120 100 170 92 S250 70 290 46 S370 16 434 12 L434 112 L0 112 Z" fill="url(#ms-spend-fill)" />
        <path d="M0 104 C70 102 120 100 170 92 S250 70 290 46 S370 16 434 12" fill="none" stroke="#fff" strokeWidth="1.6" />
      </svg>
      <div className="ms-chart-axis"><span>01</span><span>07</span><span>14</span><span>21</span><span>28</span></div>
    </div>
  );
}
