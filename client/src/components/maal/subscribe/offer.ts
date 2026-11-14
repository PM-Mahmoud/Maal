// subscribe/offer.ts — price + payment-status calls for the subscribe screens.
// The numbers come from the server (GET /billing/offer → routes/billing.js
// offerSummary(), which reads lib/membership.js), so the copy can't drift from
// what Stripe charges. FALLBACK_OFFER is only used if that call fails and
// mirrors lib/membership.js (covered by test/subscribe-flow.test.js).

export type Offer = {
  currency: "AUD";
  gstInclusive: boolean;
  firstYearCents: number;
  renewalCents: number;
  firstYear: string; // "$4.99"
  renewal: string; // "$49.99"
  firstYearGstCents: number;
  renewalGstCents: number;
  discountPercent: number; // 90
  trialDays: number; // 14
};

export const FALLBACK_OFFER: Offer = {
  currency: "AUD",
  gstInclusive: true,
  firstYearCents: 499,
  renewalCents: 4999,
  firstYear: "$4.99",
  renewal: "$49.99",
  firstYearGstCents: 45,
  renewalGstCents: 454,
  discountPercent: 90,
  trialDays: 14,
};

export async function fetchOffer(): Promise<Offer> {
  try {
    const r = await fetch("/billing/offer", { credentials: "include" });
    if (!r.ok) return FALLBACK_OFFER;
    return { ...FALLBACK_OFFER, ...((await r.json()) as Partial<Offer>) };
  } catch {
    return FALLBACK_OFFER;
  }
}

export type PaymentState = "active" | "pending" | "failed";

// GET /billing/status — the Payment processing screen polls this until the
// plan is active. Network errors count as "pending" so polling continues.
export async function fetchPaymentStatus(sessionId?: string | null): Promise<PaymentState> {
  try {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    const r = await fetch(`/billing/status${q}`, { credentials: "include" });
    if (!r.ok) return "pending";
    const j = (await r.json()) as { state?: PaymentState };
    return j.state === "active" || j.state === "failed" ? j.state : "pending";
  } catch {
    return "pending";
  }
}
