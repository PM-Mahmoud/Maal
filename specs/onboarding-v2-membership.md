# Onboarding v2 + Membership pricing + Referrals

> Status: **DRAFT — awaiting Mahmoud's sign-off** (2026-11-15)
> Decisions below were made by Mahmoud in Q&A on 2026-11-15. Anything marked
> **ASSUMPTION** is a default chosen by Claude — confirm or change before build.

## Goal

Rebuild Maal's first-run experience on the *pattern* of a leading US all-in-one
money app's 2026 web onboarding (studied via Mobbin), in a new Maal visual style
that resembles it as closely as possible **without copying its words, imagery,
logos or name**. At the same time, replace Pro/Max with a single membership,
add a 14-day free trial, and add real referrals.

Partner names are under NDA — never write any partner's name in this repo.

## Decisions (from Mahmoud)

| Topic | Decision |
|---|---|
| Visual style | New style resembling the reference app's UI (layout, type pairing, spacing, components). Own words, own imagery, no reference-app names/logos/press badges. |
| Hero | Big serif heading **"Your interest-free ecosystem"**; badge **"$4.99 FOR 1 YEAR — LIMITED TIME"**. |
| Pricing | One paid plan: **$4.99 for the first year, then $49.99/year** (AUD). Remove the $20/mo and $200/mo plans from sale. |
| What it includes (public copy) | "Access to AI chat" + partner investment options in **general-information wording** (e.g. "Explore profit-based investment options from our partners"). Never "curated funds to grow your savings" until licensing is confirmed. |
| AI chat limit | **100 Ask Maal messages / month, hard stop, never advertised.** Friendly "you've reached this month's limit, resets on the 1st" at 100. |
| Free plan | **Free trial, then paywall.** 14 days full access, **no card up front**. After day 14 the dashboard shows the paywall until they pay. |
| Banks step | **Real Basiq connect** (sandbox until production). Australian bank **names**, no logos. |
| Referrals | **Real.** Refer 3 friends who become paying members → your next renewal is **$4.99 instead of $49.99**. Friends get the normal $4.99 first-year offer. |
| Referral × waitlist | **A referral link acts as an invite**: the friend can sign up straight away. Everyone else still joins the waitlist. |
| "How did you hear about us?" | Keep, same idea and options (plus "Event"). |
| Scope (this project) | **Homepage (hero + main page) + the whole onboarding.** The rest of the app is restyled later. |

## The flow (web)

1. **Homepage** — new style. Hero: serif "Your interest-free ecosystem", $4.99 badge, one-line subhead, **Get started**, and an "Ask anything" teaser input (typing opens sign-up). Trust row uses Maal's own facts (e.g. "Read-only via CDR open banking", "Australian-built", "Education, not advice") — no press logos we haven't earned.
2. **Sign-up (two-panel)** — left: offer ("$4.99 for your first year · then $49.99/yr · cancel anytime"), Google button, email. Right: dark panel with Maal's own illustration + a sample Maal Score / net-worth card. While the waitlist gate is on, only invited emails or referral-link visitors can complete this; others are sent to the waitlist.
3. **Create account** — email (pre-filled), full name, password with a **live rules checklist + strength bar** (red ✗ → green ✓). Back / Next.
4. **Referral offer** — "Refer 3 friends, renew for $4.99." 3-step timeline, **Share your link** + **Copy link**, Skip. *(ASSUMPTION: shown here like the reference flow; we can move it to after the dashboard if it feels pushy.)*
5. **Goal picker** — "Welcome to Maal. Where would you like to start?" Single or multi-select (ASSUMPTION: multi): Understand my money (Maal Score) · Pay down debt · Grow my super · Invest the profit-based way · Ask Maal anything · Not sure yet. Next disabled until one is picked; Skip available. Saved to `user_profiles.onboarding_data.goals` and used to personalise the plan + Ask Maal suggestions.
6. **Connect your accounts** — dark, cinematic step, Australian bank names (CommBank, Westpac, NAB, ANZ, Macquarie, ING, Bendigo, Suncorp, BOQ, ubank…) as text chips, **Connect my accounts** → Basiq consent (`/basiq/connect`). Skip available.
7. **Linked!** — "Nice work, {first name}. You've linked {N} account(s)." List of linked accounts, **Link another account**, **Continue**. Because Basiq's consent UI doesn't redirect back, this step polls for new accounts after the user returns (button "I've finished connecting" + background sync).
8. **How did you hear about us?** — Reddit, Friends & family, Google, X, TikTok, Instagram/Facebook, Event, Other. Saved to `onboarding_data.heard_from`.
9. **Dashboard + setup guide** — real dashboard with a "Make the most of Maal · x% complete" card (progress ring + expandable tasks: link accounts, set a goal, ask Maal a question, invite friends). Replaces/extends `SetupChecklist`.
10. **Paywall** — during the trial: a dismissible banner "x days left in your trial". **After day 14:** the dashboard renders blurred behind a non-dismissible "$4.99 for your first year · then $49.99/yr" card → Stripe Checkout.

## Visual system (new "v2" tokens, homepage + onboarding only)

Resembles the reference without copying assets:
- **Type:** serif display for headings (Google Fonts, e.g. *Instrument Serif* or *Newsreader* — ASSUMPTION), clean sans for body (*Geist*, already used), small **uppercase monospace labels** for section kickers (*IBM Plex Mono* / *JetBrains Mono* — ASSUMPTION).
- **Colour:** warm off-white page, white cards with hairline borders, near-black primary buttons, one dark "night" panel style for hero/sign-up/connect; Maal's teal stays the single accent.
- **Imagery:** our own — CSS/SVG gradient skies/horizons and abstract shapes. No stock photos that mimic the reference.
- **Components:** two-panel auth card, option-row list (icon + label, selected = grey fill + border), live password checklist, step header (Back · logo · Skip), progress-ring guide, paywall card over a blurred dashboard.
- Disclaimer stays on every page.

## Backend changes

### Membership + trial (PR 1)
- New plan key **`member`**: `lib/plan-limits.js` → `advisor_messages: 100` (hard), research/radar/files **ASSUMPTION: 10 / 10 / 10 (same as old Pro)**. `pro`/`max` keys stay valid for any existing subscribers (grandfathered, not sold).
- Upgrade copy at 100 messages never shows the number on marketing pages; the in-app limit message says "this month's limit".
- **Trial** stored in a new `user_trials` table (`user_id` PK/FK, `started_at`, `ends_at`) — **not** a new column on the protected `users` table. Started at account creation (14 days). Existing users: ASSUMPTION — get a 14-day trial from deploy day.
- Access rule: `member | pro | max` → full access; trial active → full access with `member` limits; otherwise → paywall (API returns 402 `{code:'trial_ended'}`, client shows paywall).
- **Stripe:** one Price `$49.99/yr` (recurring yearly) + a coupon `amount_off $45, duration once` applied at Checkout so the first year is $4.99. Webhook unchanged in shape (`checkout.session.completed` → plan `member`). Renewal shows $49.99 clearly at checkout and on the billing page (Australian Consumer Law: auto-renewal price must be prominent).
- Billing page (`/app/billing`): one plan card, trial status, renewal date/price; Pro/Max cards removed (legacy subscribers still see their current plan + downgrade).
- `FREE_ADVISOR_MESSAGES` becomes irrelevant for trial users (trial uses member limits); keep the env for post-trial free access only if we ever reintroduce Free.

### Referrals (PR 2)
- Tables: `referral_codes (user_id PK, code UNIQUE)`, `referrals (id, referrer_user_id, referred_user_id UNIQUE, status: signed_up|paid, created_at, paid_at)`.
- Link: `/r/:code` → sets a signed, 30-day cookie, redirects to sign-up with the offer.
- **Gate bypass:** sign-up with a valid referral cookie skips the waitlist gate (`services/waitlist-access.canSignUp`). Codes are per-member and rate-limited; a code stops working as an invite after N uses (ASSUMPTION: 20) to stop public posting from bypassing the waitlist entirely.
- On the referred user's first successful payment → `referrals.status = paid`.
- **Reward:** when a referrer reaches 3 `paid` referrals, attach a Stripe coupon (`amount_off $45, duration once`) to their subscription so the **next renewal** is $4.99. One reward per renewal year (ASSUMPTION). Shown in app as "2/3 friends joined".
- Self-referral and same-email/duplicate checks; no reward for refunded/chargeback payments.

### Onboarding data (PR 4)
- `goals[]`, `heard_from` stored in `user_profiles.onboarding_data` (JSONB, existing).
- Basiq: reuse `/basiq/connect` and `/basiq/sync`; new lightweight `GET /api/v1/accounts/linked` (ownership-filtered) for the "Linked!" step.

## PR sequence

1. **Membership, trial & paywall backend** — plan `member`, `user_trials`, Stripe price + first-year coupon, access rule, billing page, tests (`plan-limits`, trial date maths, price resolution).
2. **Referrals** — tables, `/r/:code`, gate bypass, tracking, Stripe reward, "Invite friends" UI, tests (reward counting, abuse checks).
3. **v2 visual system + homepage** — tokens/fonts, new hero ("Your interest-free ecosystem", $4.99 badge), main page sections, nav.
4. **Onboarding flow** — two-panel sign-up, account step with live password checklist, referral step, goal picker, connect accounts (AU banks), Linked!, how-did-you-hear, setup guide, paywall overlay.

Each PR runs `npm test` + `scripts/render-test.js`, and is previewed in the browser before review.

## Compliance notes (not legal advice — confirm with a lawyer)
- **Auto-renewal (ACL):** first-year price and renewal price shown together everywhere the offer appears; renewal reminder email before the first renewal (ASSUMPTION: 7 days before).
- **Partner products:** general-information wording only; no "curated funds to grow your savings" until AFSL / authorised-representative position is confirmed.
- **Spam Act:** waitlist/marketing emails need the consent tick (already built); referral share messages are sent by the user, not by Maal.
- **Trial without card:** no auto-charge at day 14 — the paywall asks them to pay.

## Open questions (defaults above until answered)
1. Research / Radar / AI-file limits on the new plan — default 10/10/10.
2. Existing accounts — default: everyone gets a fresh 14-day trial on deploy day.
3. Goal picker single vs multi-select — default multi.
4. Referral step placement — default in onboarding (as reference); alternative: after first dashboard visit.
5. Display + label fonts — default Instrument Serif + IBM Plex Mono.
