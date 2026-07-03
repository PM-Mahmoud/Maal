# Maal homepage UI/UX redesign spec v1

Reference mockup: https://mahmood.adaptive.ai/cdn/maal-mockups/homepage-refresh-v1.png

## Goal

Make `hellomaal.com` feel more premium, clearer, and more immediately product-led while preserving the current minimal Maal brand. The page should still feel simple and trustworthy, but less stark and more like a modern Australian fintech product.

The core message stays:

> Maal gives everyday Australians one clear view of their financial wellbeing — score, super, HECS/debt, accounts, spending, portfolio, and education in one place.

## Current issue

The current homepage is clean, but the above-the-fold experience is visually underused. The left-side hero copy is strong, but there is not enough product context visible immediately. A visitor has to scroll to understand what Maal actually looks like and what they get.

The redesign should fix that by making the product UI the main visual anchor.

## Design direction

### Feel

- Premium but approachable
- Australian fintech, not US budgeting app
- Calm, clear, financially literate
- Minimal, but not empty
- Trustworthy without feeling institutional

### Visual language

- Warm off-white background instead of pure white
- Deep charcoal text instead of absolute black where possible
- One restrained mint/teal accent
- Soft cards with subtle borders and shadows
- Rounded dashboard components
- Lots of whitespace, but with clearer composition
- Avoid loud gradients, stock imagery, cartoon illustrations, crypto-style charts, and overly playful finance visuals

## Suggested palette

Use this as a starting system rather than exact final values.

| Role | Colour |
|---|---|
| Background | `#F7F5EF` warm off-white |
| Surface/card | `#FFFFFF` |
| Primary text | `#101112` |
| Secondary text | `#6B7078` |
| Border | `#E5E0D7` |
| Primary accent | `#11B59A` |
| Accent dark | `#087E6E` |
| Soft accent bg | `#E7F8F4` |
| Positive | `#169B62` |
| Warning/attention | `#D68A1F` |

The site can remain mostly neutral. Use green/mint only for trust cues, score progress, selected states, and small highlights.

## Typography

Keep the current bold editorial feel, but refine the hierarchy.

Recommended direction:

- Hero headline: large, bold, tight tracking, strong line-height
- Body copy: slightly larger and more readable than current, around 18–20px desktop
- Eyebrows: small uppercase, wider tracking, muted grey
- Product card numbers: tabular numerals if possible
- Avoid too many weights; use size, spacing, and contrast for hierarchy

Suggested desktop hero type:

- H1: 72–88px, line-height 0.92–1.0
- Hero body: 19–21px, line-height 1.6
- Nav: 14–15px
- CTA: 15–16px, semibold

Suggested mobile hero type:

- H1: 48–56px
- Hero body: 17–18px
- Keep buttons full-width or near full-width on narrow screens

## Homepage structure

### 1. Navigation

Current nav is fine structurally. Improve polish.

Recommended layout:

- Left: Maal wordmark with small mint dot/icon
- Centre-left: Score Calculator, Pricing, Waitlist
- Right: Log in, primary CTA

Improvements:

- Make nav slightly taller and more intentional, around 72px
- Use a soft bottom border
- Keep CTA as black/charcoal button or dark green button
- Add hover states: soft background tint, slight opacity change
- Keep nav sticky only if performance and mobile behaviour are clean

Suggested nav copy:

- Logo: Maal
- Links: Score Calculator, Pricing, Waitlist
- Secondary: Log in
- Primary: Calculate your score

### 2. Hero section

This is the main redesign opportunity.

Recommended desktop layout:

- Two-column grid
- Left column: copy and CTAs
- Right column: product preview card/dashboard
- Max width: around 1180–1240px
- Hero vertical padding: 88–120px desktop

#### Left column

Eyebrow:

> BUILT FOR AUSTRALIA

Headline:

> Your money,
> in balance.

Body:

> Maal gives everyday Australians one clear view of their financial wellbeing — score, super, HECS, debt, accounts, spending and portfolio — explained in plain language.

Primary CTA:

> Get your score free

Secondary CTA:

> See how it works

Trust microcopy:

> Free to start. No card required. Read-only connections via Basiq.

Why change the copy: the current paragraph is good but slightly long and abstract. This version is more scannable and names the product modules earlier.

#### Right column: product preview

Create a dashboard-style card showing what Maal does. This should not be a generic illustration; it should look like the actual product promise.

Card contents:

- Top label: Financial wellbeing score
- Large score: `82 / 100`
- Status: `On track`
- Mini progress ring or progress bar
- Three metric rows/cards:
  - Credit Score: `742 / 1,200`
  - Debt Score: `68 / 100`
  - Super & Retirement: `78%`
- Small insight strip:
  - `Radar: NVDA moved +11% today`
  - or `Ask Maal: Is my super on track for 60?`
- Footer trust line:
  - `Read-only via Basiq · revoke anytime`

UX purpose: the user should understand the promise in 3 seconds without reading the whole page.

### 3. Trust/data proof strip

Place immediately below the hero or integrated into the hero bottom.

Suggested items:

- `3 scores` — Credit, debt & wellbeing
- `100+ institutions` — Connected via Basiq open banking
- `Built for AU` — Super, HECS & ATO-aware
- `Read-only` — Maal can never move your money

Design:

- Four compact cards or a horizontal strip
- Use muted text and small mint icons
- On mobile, stack in a 2x2 grid

### 4. Product modules section

Current section works conceptually. Make it more visually cohesive.

Current heading:

> Financial clarity, out of the box.

Keep it.

Recommended intro:

> Not another budgeting app. Maal reads your financial world and turns it into education you can act on.

Cards:

1. Maal Score
   Copy: `One number that tracks your financial wellbeing across net worth, debt, super, diversification and buffer.`

2. Ask Maal
   Copy: `Ask questions grounded in your own data — from super projections to spending patterns.`

3. Radar
   Copy: `Catch meaningful changes in markets, accounts and your financial position before they become noise.`

4. Portfolio
   Copy: `See your wealth move over time across cash, investments, super and property.`

5. Accounts
   Copy: `Bring accounts together through read-only open banking connections.`

Layout:

- Desktop: one featured large card plus four smaller cards
- Mobile: single column cards
- Each card should include a small product-like UI fragment, not just text

### 5. How it works

Current three-step structure is strong. Improve rhythm and reduce text density.

Keep:

1. Tell Maal what you have
2. Get your Maal Score
3. Follow your action plan

Suggested copy tightening:

#### 01 — Tell Maal what you have

> Add income, super, HECS, mortgage, savings and investments. Start manually, then connect accounts when you're ready.

#### 02 — Get your Maal Score

> A 0–100 view of financial wellbeing across net worth, debt, super, diversification and emergency buffer.

#### 03 — Follow your action plan

> See the highest-impact moves to improve your score. The plan adapts as your finances change.

Design:

- Use a timeline or stepped cards
- Add a subtle vertical connector on desktop
- Use large step numbers as graphic elements

### 6. Why Maal

Current copy is good. Make the section feel more ownable and Australian.

Recommended heading:

> Built for the financial life Australians actually have.

Supporting copy:

> Super, HECS, franking credits, EOFY, the ATO, property, debt and open banking all shape how Australians build wealth. Maal brings them into one clear picture.

Cards:

- Clarity by design
- Australian to the core
- Secure and read-only
- Education, not instructions

Design:

- Four cards in a 2x2 grid
- Use subtle icons or simple line glyphs
- Keep the disclaimer/legal nuance nearby but not heavy-handed

### 7. Pricing

Current tiers are clear. Improve hierarchy.

Recommended pricing layout:

- Three cards
- Pro card visually featured
- Make Free and Max slightly quieter
- Use short, benefit-led bullets

Suggested tier copy:

#### Free — $0 forever

- Maal Score
- Basic dashboard
- Manual entry
- Education-first action plan

CTA: `Start free`

#### Pro — $20 AUD / month

- Open banking sync
- Super and retirement projections
- Tax and super tools
- Ask Maal

CTA: `Get Pro`

Badge: `Most popular`

#### Max — $200 AUD / month

- Multi-entity tracking
- Radar alerts
- Vault PDF extraction
- Priority support/advisor workflow

CTA: `Talk to us`

### 8. Final CTA

Current line is strong:

> Stop guessing. Start scoring.

Keep it, but make the section feel like a contained conversion block.

Suggested copy:

> Two minutes to your first Maal Score. No bank login. No credit card.

Buttons:

- `Calculate your score`
- `Join the waitlist`

Design:

- Warm dark charcoal or deep green block
- Inverted text
- Maybe include a mini score preview or trust row

### 9. Footer

Current footer is useful. Improve polish and readability.

Recommendations:

- Keep disclaimer, but reduce visual dominance by using smaller type and a contained muted panel
- Add ABN/AFSL-related text if relevant later
- Keep "educational disclaimer" very clear
- Make links easier to scan

## Interaction details

### CTA behaviour

Primary CTAs should consistently point to score calculation/sign-up:

- Hero: `Get your score free`
- Nav: `Calculate your score`
- Pricing Free: `Start free`
- Final CTA: `Calculate your score`

Avoid splitting attention between too many equal CTAs.

### Mobile behaviour

- Hero stacks: copy first, product card second
- CTA buttons should be full-width or nearly full-width
- Product preview should be simplified, not squeezed
- Trust stats should become a 2x2 grid
- Pricing cards stack with Pro first or Pro highlighted clearly
- Nav should collapse into a clean mobile menu

### Accessibility

- Maintain AA contrast for text and buttons
- Buttons minimum 44px height
- Inputs, if present, should use 16px font size on mobile
- Product preview should not be the only source of key information; important claims also need text
- Avoid using green alone to communicate success/status

## Component checklist

Build these reusable components:

- `NavBar`
- `HeroSection`
- `ProductPreviewCard`
- `TrustStrip`
- `ProductModuleCard`
- `HowItWorksStep`
- `WhyMaalCard`
- `PricingCard`
- `FinalCTA`
- `Footer`

## Implementation priorities

If doing this in stages, do it in this order:

1. Redesign hero with product preview card
2. Add trust strip under hero
3. Tighten copy and spacing across sections
4. Redesign product module cards
5. Polish pricing and final CTA
6. Improve mobile nav and responsive states
7. Add motion/hover details last

## Quick developer notes

- Use CSS variables/design tokens for colours
- Avoid hardcoded one-off colours across components
- Use a max-width container around `1180px` or `1240px`
- Use consistent border radius, likely 20–28px for major cards and 12–16px for small elements
- Use subtle shadows only on hero/product cards
- Keep animations minimal: fade/slide on scroll, hover lift on cards, progress ring draw if tasteful
- Product UI preview should be real HTML/CSS, not a static image, so it stays crisp and editable

## Success criteria

The redesigned homepage is working if a new visitor can answer these within 5 seconds:

1. What is Maal? — A financial wellbeing product for Australians.
2. What do I get? — A score, clear dashboard, account/super/debt/portfolio context, and educational guidance.
3. Is it safe? — Yes — free to start, no card required, read-only connections via Basiq.
4. What should I do next? — Get my score free / calculate my score.
