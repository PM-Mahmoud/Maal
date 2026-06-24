# PORTING-SPEC.md — Next.js Maal calculators → our TanStack React SPA

> **Audience:** the builder agent. Follow this literally. You should NOT need to re-read the
> source components except where a step explicitly says "open the source file".
>
> **Source root:** `/tmp/maal-workspace-unpack/src/components/maal/`
> **Target repo:** `/Users/mahmoudsair/Desktop/Desktop - Mahmoud's MacBook Air/Claude - Maal/Maal/`
> **Target route dir:** `client/src/routes/_authenticated/app.<name>.tsx`
> **Build after changes:** `cd client && npx vite build` (and `npx tsc --noEmit` to typecheck).

---

## 0. Executive summary

We are porting **11 self-contained interactive calculators** from the source Next.js build into our
TanStack Router SPA. They are pure client-side React (recharts + framer-motion + shadcn/ui), no backend.
The recommended first wave is **8 tools** (Tier 1 + Tier 2 below).

**Bugs found across the candidates: 14** (see the per-feature "Bugs the builder MUST fix" lines, and
the consolidated table in §3). The big systemic ones:

1. **`fmtAUD(x * 100)` cents bug** — the source `fmtAUD` takes **dollars**, not cents. Several files
   multiply every money value by 100 before formatting, rendering everything 100× too large
   (e.g. `$180,000` shows as `$18,000,000`). This is per-file and inconsistent — some files have it,
   two files do NOT. The exact count per file is in §1 (Global rule G4) and §3.
2. **tax-optimizer ships STALE stage-2 tax brackets** (19% / 32.5%) — this is audit item #14. Must be
   replaced with stage-3 (16% / 30% / 37% / 45%).
3. **insurance-gap internal inconsistency** — education cost uses `$100k`/dependant in the engine but
   the UI hint and the STAT_TEMPLATES say `$200k` / "5×". Pick `$100k` (matches the engine) and fix the
   stray template.

**Blocking missing dependencies: NONE.** recharts, framer-motion, sonner, lucide-react and every shadcn
component these tools use are already installed (verified — see §"Missing dependencies"). The only
prep work is **adding ~12 CSS utility classes** the source relies on (`border-hairline`, `mint-soft`,
`surface-2`, `kpi-tile`, `section-number`, `eyebrow-bullet`, `text-gradient-mint`, `dot-pulse`,
`soft-glow`) to `client/src/globals.css` — done **once**, up front (§"Global porting rules" → G6).

---

## Global porting rules (apply to EVERY file)

Do these transformations to every ported component, in order:

- **G1 — Remove `'use client'`.** Delete the first line `'use client'` from every source file. TanStack
  has no such directive.

- **G2 — Reveal import + API remap.**
  - Change `import { Reveal } from '@/components/maal/reveal'` →
    `import { Reveal } from '@/components/maal/Reveal'` (capital R — our file).
  - **API DIFFERS.** Source `Reveal` props: `{ children, delay (seconds), y, className }`.
    Our `Reveal` props: `{ children, delay (MILLISECONDS), as, className }`. There is no `y` prop.
  - For each `<Reveal delay={0.05}>` etc., **multiply delay by 1000** (`0.05`→`50`, `0.1`→`100`,
    `0.15`→`150`, `0.2`→`200`, `0.25`→`250`, `0.3`→`300`, `0.35`→`350`). Drop any `y={...}` prop.

- **G3 — Disclaimer import remap.** Change
  `import { Disclaimer } from '@/components/maal/disclaimer'` →
  `import { Disclaimer } from '@/components/maal/Disclaimer'` (capital D — our file). Our `Disclaimer`
  accepts `variant?: "footer" | "inline"` and **defaults to `"footer"`**; the source defaults to
  `"inline"`. Where the source renders a bare `<Disclaimer />` inside a card/results column, change it to
  `<Disclaimer variant="inline" />` so it stays compact.

- **G4 — `fmtAUD` → `formatAUD` AND strip the `* 100` cents bug.**
  - Change `import { fmtAUD } from '@/lib/score'` → `import { formatAUD } from '@/lib/score'`.
  - Replace every call `fmtAUD(` → `formatAUD(`.
  - **CRITICAL:** wherever the source passes a money value multiplied by 100 — i.e. `formatAUD(X * 100)`
    — **remove the `* 100`** so it becomes `formatAUD(X)`. Our `formatAUD` already takes plain dollars.
    Per-file occurrence counts are in §3; do NOT blanket-remove every `* 100` in the file — only the ones
    **inside a `formatAUD(...)` call**. (Some `* 100` are legitimate percentage math, e.g.
    `(gap / total) * 100`, and `width: ${pct}%` — leave those.)
  - **Note on precision:** our `formatAUD` abbreviates (`$180k`, `$1.50M`) while the source `fmtAUD`
    printed full figures (`$180,000`). This is acceptable for sliders/headline KPIs. For the two
    **precise-dollar tax tools** (tax-optimizer, tax-bracket-visualizer) where exact dollars matter,
    add a local `const fmtExact = (n: number) => "$" + Math.round(n).toLocaleString("en-AU")` and use it
    for the precise figures (total tax, taxable income, per-bracket amounts). Keep `formatAUD` for
    slider labels. This is called out again in those features' sections.

- **G5 — TanStack route wrapper (boilerplate at top of each new file).** Each source file exports a named
  component, e.g. `export function SuperOptimizer() {...}`. In the target route file, keep that component
  (rename to a local default if you like) and add at the very top:

  ```tsx
  import { createFileRoute } from "@tanstack/react-router";
  // ...all the component's other imports...

  export const Route = createFileRoute("/_authenticated/app/<name>")({
    component: <ComponentName>,
  });

  function <ComponentName>() {
    // ...body copied from source (minus 'use client')...
  }
  ```

  Use the exact `<name>` from each feature's "target file" line below. The component may keep its
  outer `<section ...>` wrapper — it renders fine inside our app shell.

- **G6 — Add missing CSS utility classes (do this ONCE, before porting any file).** The source uses
  Tailwind-ish utility classes that do **not** exist in our `client/src/globals.css`. Rather than rewrite
  hundreds of classNames, add these definitions once inside the `@layer utilities { ... }` (or a new
  `@layer utilities`) block in `client/src/globals.css`. They map onto our existing hex tokens:

  ```css
  @layer utilities {
    .border-hairline { border-color: var(--border); }
    .bg-surface-2    { background-color: var(--secondary); }
    .bg-surface-2\/40 { background-color: color-mix(in oklab, var(--secondary) 40%, transparent); }
    .bg-surface-2\/60 { background-color: color-mix(in oklab, var(--secondary) 60%, transparent); }
    .bg-mint-soft    { background-color: color-mix(in oklab, var(--mint) 12%, transparent); }
    .bg-mint-soft\/50 { background-color: color-mix(in oklab, var(--mint) 8%, transparent); }
    .text-mint       { color: var(--mint); }
    .bg-mint         { background-color: var(--mint); }
    .border-mint\/30 { border-color: color-mix(in oklab, var(--mint) 30%, transparent); }
    .text-gold       { color: var(--gold); }
    .text-gradient-mint {
      background: linear-gradient(90deg, var(--mint), #5FE3D1);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .eyebrow-bullet  { font-size: .75rem; font-weight: 500; text-transform: uppercase;
                       letter-spacing: .12em; color: var(--mint); }
    .section-number  { font-size: 1.25rem; }
    .kpi-tile        { transition: border-color .2s ease; }
    .soft-glow       { box-shadow: 0 0 0 1px color-mix(in oklab, var(--mint) 30%, transparent),
                       0 8px 30px -12px color-mix(in oklab, var(--mint) 40%, transparent); }
    .dot-pulse       { animation: dot-pulse 1.6s ease-in-out infinite; }
  }
  @keyframes dot-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  ```

  Notes: `tracking-display` already exists in globals.css — do not redefine it. `bg-surface-2`,
  `bg-mint-soft` etc. with `/NN` opacity suffixes: Tailwind will not generate these for arbitrary custom
  classes, so the explicit `.bg-surface-2\/40` style rules above are required for the specific suffixes
  the source uses. If you hit a suffix not listed (grep the file for `surface-2/` and `mint-soft/`), add
  the matching escaped rule. Colors that already resolve via Tailwind+our tokens (`text-muted-foreground`,
  `bg-card`, `border-border`, `text-rose-500`, `text-emerald-500`, `text-amber-500`, `bg-background`) need
  no work.

- **G7 — No `next/*` / `next-intl` / server-only imports** appear in any of the 11 calculators (verified).
  If you somehow find one, remove it. Do not import `framer-motion` lazily — it is installed; `motion` /
  `useInView` work client-side as-is.

- **G8 — `localStorage` guards stay.** tax-optimizer and debt-payoff persist to `localStorage` with
  `typeof window === 'undefined'` guards. Keep them — they are harmless and SSR-safe in our SPA too.

- **G9 — Sidebar nav.** After porting, register each tool in the sidebar. The nav lives in
  `client/src/components/maal/app/AppShell.tsx` as the `TOP` / `PORTFOLIO` arrays (type
  `Item = { to: string; label: string; icon: any; soon?: boolean }`). Add a **new `TOOLS` group** array
  and render it in the `<nav>` the same way the existing groups render (see lines ~16–33 and the `<nav>`
  block ~75–114). Per-feature nav rows are listed below. Also add a card for each on the Tools page
  (§"Tools page cards").

---

## 1. Recommended port order (ranked: value × portability)

### Tier 1 — port first (highest value, lowest risk, fully self-contained, AU-correct after fixes)
1. **super-optimizer** — health-pro super sacrifice optimizer; SG 12% + Div293 + concessional cap correct.
2. **tax-optimizer** — doctor tax optimizer (deductions, MLS, HECS, LITO). **Must fix stale brackets.**
3. **tax-bracket-visualizer** — educational marginal-vs-effective visualizer; stage-3 brackets correct.
4. **debt-payoff** — snowball/avalanche; zero AU-constant risk, zero `*100` bug; cleanest port.

### Tier 2 — port next (high value, self-contained)
5. **scenarios-simulator** — Monte Carlo retirement range (self-contained PRNG).
6. **insurance-gap** — clinician life/TPD gap. **Fix education-cost inconsistency.**
7. **net-worth-flow** — monthly cashflow + net-worth composition (educational).
8. **cost-of-living** — AU city comparator for relocating clinicians.

### Tier 3 — port if time allows (depend on extra score.ts helpers / heavier)
9. **retirement-projection** — needs `projectRetirement` + `ASFA_SINGLE_TARGET` added to our score.ts (§T9).
10. **practice-valuation** — practice valuation (33 KB, large but self-contained).
11. **practice-cashflow** — practice P&L / runway (self-contained).

> If you must stop early, ship Tier 1 (4 tools). Tier 1+2 (8 tools) is the target first wave.

---

## 2. Per-feature port specs

For every feature: apply ALL Global rules G1–G9 first, then the feature-specific notes.

---

### FEATURE 1 — Super Optimizer  ⟶ Tier 1
- **Source:** `src/components/maal/super-optimizer.tsx` (343 LOC, exports `SuperOptimizer`)
- **Target:** `client/src/routes/_authenticated/app.super-optimizer.tsx`
- **Route name:** `/_authenticated/app/super-optimizer`
- **External deps:** recharts (AreaChart/Area/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid),
  lucide-react, shadcn: Button, Slider, Label, Card, Badge, Select. framer-motion only via `Reveal`.
- **Self-contained?** Yes. No props, no API.
- **AU constants (all CORRECT — keep):** `SG_RATE = 0.12`, `CONCESSIONAL_CAP = 30_000`,
  `DIV293_THRESHOLD = 250_000`, Div293 extra-tax rate `0.30`, marginal `0.45`.
- **`* 100` cents bug:** YES — **13 occurrences** inside `fmtAUD(...)`. Strip every `* 100` per G4. Note
  the title paragraph uses `fmtAUD(CONCESSIONAL_CAP * 100)` which is doubly wrong (the literal `$` prefix
  PLUS `*100`) → becomes `formatAUD(CONCESSIONAL_CAP)` and drop the extra leading `$` if present.
- **Bugs the builder MUST fix:** (a) all 13 `* 100`. (b) The "% more" line
  `((diff / finalNoExtra) * 100)` — leave as-is (legit percentage, not a formatAUD call).
- **Missing shadcn:** none.
- **Sidebar:** TOOLS group → `{ to: "/app/super-optimizer", label: "Super Optimizer", icon: PiggyBank }`.
- **Done when:** at $180k salary the SG line reads `$21k` (not `$2.1M`), the chart Y-axis tops out near
  `$1–2M` (not billions), and the "tax saved" stat is a sane few-thousand-dollar figure.

---

### FEATURE 2 — Tax Optimizer  ⟶ Tier 1  (⚠ has the stale-bracket bug)
- **Source:** `src/components/maal/tax-optimizer.tsx` (708 LOC, exports `TaxOptimizer`)
- **Target:** `client/src/routes/_authenticated/app.tax-optimizer.tsx`
- **Route name:** `/_authenticated/app/tax-optimizer`
- **External deps:** recharts (BarChart/Bar/Cell/XAxis/YAxis/Tooltip/ResponsiveContainer), lucide-react,
  sonner (`toast`), shadcn: Button, Input, Label, Select, Slider.
- **Self-contained?** Yes. Persists inputs to `localStorage` key `maal:tax` (keep, per G8).
- **`* 100` cents bug:** Only **2 occurrences** total, and they are NOT in `formatAUD` calls — this file
  already calls `fmtAUD(value)` with plain dollars. So after G4's `fmtAUD`→`formatAUD` rename there is
  **nothing to strip**. Double-check: the 2 `* 100` are `fmtPct` percentage math — leave them.
- **🔴 Bug the builder MUST fix (audit item #14 — STALE STAGE-2 BRACKETS):** the `TAX_BRACKETS` const
  (source lines ~85–91) is wrong. Replace it with the **stage-3 FY25-26** table:
  ```ts
  const TAX_BRACKETS: ReadonlyArray<{ threshold: number; rate: number }> = [
    { threshold: 0,       rate: 0 },
    { threshold: 18_200,  rate: 0.16 },   // was 0.19  ❌
    { threshold: 45_000,  rate: 0.30 },   // was 0.325 ❌
    { threshold: 135_000, rate: 0.37 },
    { threshold: 190_000, rate: 0.45 },
  ];
  ```
  Also update the JSDoc comment above it (it documents the old 19% / 32.5% rates) and any UI copy that
  says "FY 2024-25" → "FY 2025-26".
- **Precision:** this is a precise-dollar tool. Per G4's precision note, the headline total tax / taxable
  income / HECS / tax-saved should use an exact formatter, not the abbreviating `formatAUD`. Add
  `const fmtExact = (n: number) => "$" + Math.round(n).toLocaleString("en-AU")` and use it for those
  precise figures; keep `formatAUD` for slider value labels.
- **Other constants:** Medicare 2% over $26,000 (simplified — acceptable), MLS 1% over $93,000,
  LITO max $700 tapering at 5c over $37,500, HECS table, `SUPER_CAP_FY25 = 30_000` — all keep.
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/tax-optimizer", label: "Tax Optimizer", icon: Receipt }`.
- **Done when:** at $180k gross with default deductions, the marginal rate shows **37%** and total tax is
  in the ~$45–55k range (the stage-3 numbers), and no figure is 100× inflated.

---

### FEATURE 3 — Tax Bracket Visualizer  ⟶ Tier 1
- **Source:** `src/components/maal/tax-bracket-visualizer.tsx` (365 LOC, exports `TaxBracketVisualizer`)
- **Target:** `client/src/routes/_authenticated/app.tax-bracket-visualizer.tsx`
- **Route name:** `/_authenticated/app/tax-bracket-visualizer`
- **External deps:** lucide-react, shadcn: Slider, Label, Card, Badge. (No recharts — pure CSS bars.)
- **Self-contained?** Yes.
- **AU constants (CORRECT — keep):** `BRACKETS` already use stage-3 (0 / 16c / 30c / 37c / 45c). Medicare
  2% with phase-in. These are right; do NOT change them. (This file is the *correct* reference; the
  tax-optimizer above is the broken one.)
- **`* 100` cents bug:** YES — **17 occurrences** inside `fmtAUD(...)`. Strip every one per G4. Watch the
  bracket-row label which mixes `$${(b.min/1000)}k` (string math, KEEP) with `fmtAUD(... * 100)` (STRIP).
- **Precision:** precise-dollar tool — same `fmtExact` treatment as tax-optimizer for the KPI tiles
  (Taxable / Income tax / Medicare / Take-home) and per-bracket dollar amounts.
- **Minor bug:** `const inBracket = Math.min(taxable, upper) - b.min + 1` — the `+ 1` adds a spurious
  dollar per bracket. Harmless (≤ $0.16 of tax) but you may drop the `+ 1` for correctness.
- **UI copy:** change "AU 2024-25" / "FY 2024-25" → "FY 2025-26".
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/tax-bracket-visualizer", label: "Tax Brackets", icon: Calculator }`.
- **Done when:** sliding income to $180k shows take-home ≈ $125k (not negative/inflated), bars sum to
  full income width, marginal rate badge reads 37%.

---

### FEATURE 4 — Debt Payoff  ⟶ Tier 1  (cleanest port, do this to build confidence)
- **Source:** `src/components/maal/debt-payoff.tsx` (826 LOC, exports `DebtPayoff`)
- **Target:** `client/src/routes/_authenticated/app.debt-payoff.tsx`
- **Route name:** `/_authenticated/app/debt-payoff`
- **External deps:** recharts (BarChart/Bar/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid/Legend/
  Cell), framer-motion (`motion` directly — keep), lucide-react, sonner (`toast`), shadcn: Card, Button,
  Badge, Input, Label, Slider.
- **Self-contained?** Yes. `localStorage` key `maal:debts` (keep, per G8).
- **AU constants:** none hardcoded (HECS shown only as a sample debt row at 4.5% — fine).
- **`* 100` cents bug:** **NONE** (0 occurrences). After the `fmtAUD`→`formatAUD` rename there is nothing
  else to do to the money formatting. This is why it's the safest first port.
- **Bugs:** none material. (`motion.div` uses an `exit` prop without `AnimatePresence` — cosmetic, leave.)
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/debt-payoff", label: "Debt Payoff", icon: TrendingDown }`.
- **Done when:** the 3 sample debts render, switching snowball/avalanche changes the payoff order list,
  the stacked timeline chart renders with one bar series per debt, and "time saved" shows a month count.

---

### FEATURE 5 — Scenarios Simulator  ⟶ Tier 2
- **Source:** `src/components/maal/scenarios-simulator.tsx` (382 LOC, exports `ScenariosSimulator`)
- **Target:** `client/src/routes/_authenticated/app.scenarios-simulator.tsx`
- **Route name:** `/_authenticated/app/scenarios-simulator`
- **External deps:** recharts (LineChart/Line/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid),
  lucide-react, shadcn: Slider, Label, Card, Button, Select.
- **Self-contained?** Yes — local `mulberry32` PRNG + Box-Muller, 600 sims to age 60.
- **`* 100` cents bug:** YES — **7 occurrences** inside `fmtAUD(...)` (tooltip formatter, target label,
  summary cards). Strip per G4.
- **Known limitation (NOT a port blocker — leave as-is, optionally add a code comment):** the
  `successRate` is a linear interpolation between p10/p90, not a true per-sim success count. The component
  itself admits this in a comment. Acceptable for an educational tool.
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/scenarios-simulator", label: "Scenarios", icon: Dices }`.
- **Done when:** the three p10/p50/p90 lines render, "Re-run simulations" changes the seed and reshapes
  the curves, and the median/worst-case cards show $-figures in the hundreds-of-thousands to low-millions
  (not billions).

---

### FEATURE 6 — Insurance Gap  ⟶ Tier 2  (⚠ internal inconsistency)
- **Source:** `src/components/maal/insurance-gap.tsx` (311 LOC, exports `InsuranceGap`)
- **Target:** `client/src/routes/_authenticated/app.insurance-gap.tsx`
- **Route name:** `/_authenticated/app/insurance-gap`
- **External deps:** lucide-react, shadcn: Slider, Label, Card, Select. (No recharts — CSS bars.)
- **Self-contained?** Yes.
- **`* 100` cents bug:** YES — **13 occurrences** inside `fmtAUD(...)`. Strip per G4.
- **🟠 Bug the builder MUST fix (internal inconsistency):** the `needs` engine computes education as
  `dependants * 100_000` and the breakdown row labels it `(${dependants} × $100k)`, but the unused
  `STAT_TEMPLATES` array near the top declares `kids ... default: 200_000` and an `income` "Income
  replacement (5×)" template that isn't used. Resolve by: keep the engine's **$100k/dependant**, and
  **delete the unused `STAT_TEMPLATES` const** (and its `MEDIAN_DOCTOR_INCOME`-driven dead template) so
  there's no conflicting figure. `MEDIAN_DOCTOR_INCOME = 200_000` IS used in the sidebar stat — keep that.
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/insurance-gap", label: "Insurance Gap", icon: Shield }`.
- **Done when:** with defaults the gap headline shows a six-figure (not eight-figure) number, the four
  breakdown bars sum to the "total cover needed" figure, and the education row reads "2 × $100k".

---

### FEATURE 7 — Net Worth Flow  ⟶ Tier 2
- **Source:** `src/components/maal/net-worth-flow.tsx` (333 LOC, exports `NetWorthFlow`)
- **Target:** `client/src/routes/_authenticated/app.net-worth-flow.tsx`
- **Route name:** `/_authenticated/app/net-worth-flow`
- **External deps:** lucide-react, shadcn: Card, Slider, Label. (No recharts — CSS layout/bars.)
- **Self-contained?** Yes.
- **`* 100` cents bug:** YES — **21 occurrences** (the most of any file) inside `fmtAUD(...)`. Strip every
  one per G4. The net-worth composition bar widths use `(x * 12 * N / netWorth) * 100` — those are
  percentage `width` calcs, NOT formatAUD — KEEP them.
- **Bugs:** the composition bar projects super/investments/savings with rough multipliers (`*12*25`,
  `*12*10`, `*12*5`) — illustrative, leave. No correctness blocker.
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/net-worth-flow", label: "Net Worth Flow", icon: BarChart3 }`.
- **Done when:** the income/expense/savings columns render with sane $-figures, savings-rate % is 0–100,
  and the net-worth composition bar segments render proportionally.

---

### FEATURE 8 — Cost of Living  ⟶ Tier 2
- **Source:** `src/components/maal/cost-of-living.tsx` (323 LOC, exports `CostOfLivingComparator`)
- **Target:** `client/src/routes/_authenticated/app.cost-of-living.tsx`
- **Route name:** `/_authenticated/app/cost-of-living`
- **External deps:** lucide-react, shadcn: Card, Badge, Select. (No recharts.)
- **Self-contained?** Yes — hardcoded 8-city AU dataset.
- **`* 100` cents bug:** YES — **9 occurrences** inside `fmtAUD(...)` (incl. the `formatValue` helper and
  the verdict line). Strip per G4. Note `formatValue` returns `${fmtAUD(value * 100)}/mo` → becomes
  `${formatAUD(value)}/mo`.
- **Bugs:** none material (city figures are illustrative, labelled as such).
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/cost-of-living", label: "Cost of Living", icon: MapPin }`.
- **Done when:** selecting two cities shows median-house in the $hundreds-of-thousands (not billions),
  monthly rent like `$720/mo`, and the verdict names the better-surplus city.

---

### FEATURE 9 — Retirement Projection  ⟶ Tier 3  (needs score.ts helpers — see T9)
- **Source:** `src/components/maal/retirement-projection.tsx` (218 LOC, exports `RetirementProjection`)
- **Target:** `client/src/routes/_authenticated/app.retirement-projection.tsx`
- **Route name:** `/_authenticated/app/retirement-projection`
- **External deps:** recharts (ComposedChart/Area/Line/XAxis/YAxis/Tooltip/ResponsiveContainer),
  shadcn: Card, Label, Slider.
- **Self-contained?** Almost — but it imports `projectRetirement, fmtAUD, ASFA_SINGLE_TARGET` from
  `@/lib/score`. **Our `client/src/lib/score.ts` does NOT export `projectRetirement` or
  `ASFA_SINGLE_TARGET`.** See **§T9 prerequisite** below — port those two into our score.ts first.
- **`* 100` cents bug:** **NONE** (0). Uses `fmtAUD(value)` correctly — just rename to `formatAUD`.
- **⚠ Note:** our app ALSO already has an `/app/retirement` page (per the build-suggestions audit, it's an
  orphaned route). Before adding this, grep `client/src/routes/_authenticated/` for an existing
  `app.retirement*.tsx`. If one exists, either (a) replace its body with this ported component, or
  (b) ship this under `/app/retirement-projection` and leave the old one. Recommend (a) if the old page is
  the synthetic/placeholder one. Also: the build-suggestions flag a `hsl(var(--foreground))` bug in the
  existing `app.retirement.tsx` — if you touch that file, fix it to `var(--foreground)` (our tokens are
  hex, `hsl(var(--x))` renders transparent).
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/retirement-projection", label: "Retirement", icon: TrendingUp }`.
- **Done when:** the p10–p90 band + median line render over 30 years, success-rate % shows, and the ASFA
  target line `$595,000` appears in the caption.

---

### FEATURE 10 — Practice Valuation  ⟶ Tier 3
- **Source:** `src/components/maal/practice-valuation.tsx` (~880 LOC / 33 KB, exports `PracticeValuation`)
- **Target:** `client/src/routes/_authenticated/app.practice-valuation.tsx`
- **Route name:** `/_authenticated/app/practice-valuation`
- **External deps:** recharts (BarChart/Bar/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid),
  lucide-react, shadcn: Slider, Label, Card, Input, Badge, **Tabs** (TabsContent/TabsList/TabsTrigger),
  Select.
- **Self-contained?** Yes — hardcoded CE multiples, RM factors, goodwill-per-patient, location premiums.
  Three valuation methods (capitalised earnings, revenue multiple, asset-based) → low/mid/high range.
- **`* 100` cents bug:** effectively **NONE for currency** — the single `* 100` (line ~210) is
  `((result.mid - result.low) / rangeWidth) * 100` (a percentage for bar positioning) — KEEP it. All
  `fmtAUD(...)` calls already pass plain dollars; just rename to `formatAUD`.
- **Bugs:** none material. Large file — port carefully but no logic changes needed.
- **Missing shadcn:** none (Tabs is present in `client/src/components/ui/tabs.tsx`).
- **Sidebar:** `{ to: "/app/practice-valuation", label: "Practice Value", icon: Building2 }`.
- **Done when:** changing practice type/location/years updates the low/mid/high valuation range and the
  breakdown chart, with sane six/seven-figure $ values.

---

### FEATURE 11 — Practice Cashflow  ⟶ Tier 3
- **Source:** `src/components/maal/practice-cashflow.tsx` (~520 LOC, exports `PracticeCashflow`)
- **Target:** `client/src/routes/_authenticated/app.practice-cashflow.tsx`
- **Route name:** `/_authenticated/app/practice-cashflow`
- **External deps:** recharts (BarChart/Bar/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid/
  ReferenceLine), lucide-react, shadcn: Slider, Label, Card, Badge, Select.
- **Self-contained?** Yes — hardcoded specialty billing/duration table.
- **`* 100` cents bug:** YES — **14 occurrences** inside `fmtAUD(...)` (avg salary, rent, starting cash,
  gross revenue, profit, monthly figures, etc.). Strip per G4. Watch `overheadPct` math (`* overheadPct
  / 100`) — that's percentage, KEEP.
- **Bugs:** none material.
- **Missing shadcn:** none.
- **Sidebar:** `{ to: "/app/practice-cashflow", label: "Practice Cashflow", icon: Wallet }`.
- **Done when:** changing consults/day & overhead updates the monthly revenue/expense/profit chart and the
  runway figure, all $-values realistic (not 100× inflated).

---

## §T9 — Prerequisite for Feature 9 (port helpers into our score.ts)

Our `client/src/lib/score.ts` is missing two exports that `retirement-projection.tsx` imports. **Before**
porting Feature 9, copy these from the SOURCE file `/tmp/maal-workspace-unpack/src/lib/score.ts` into our
`client/src/lib/score.ts`:

1. `export const ASFA_SINGLE_TARGET = 595_000` (source line 17).
2. `export function projectRetirement(opts) {...}` — the full deterministic Monte Carlo function
   (source lines ~189–265). It is pure (mulberry32 + Box-Muller), no deps. Copy verbatim. It internally
   references `ASFA_SINGLE_TARGET` (added in step 1) — so add that first.

Do NOT copy the source's `fmtAUD` (we keep our `formatAUD`) or its `computeMaalScore`/`buildPlan` (ours
differ and are wired elsewhere). Only the two symbols above.

**Done when:** `npx tsc --noEmit` resolves the `projectRetirement` / `ASFA_SINGLE_TARGET` imports in the
retirement route with no errors.

---

## 3. Consolidated bug table (14 bugs)

| # | Feature | Bug | Fix |
|---|---------|-----|-----|
| 1 | super-optimizer | 13× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 2 | tax-bracket-visualizer | 17× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 3 | insurance-gap | 13× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 4 | scenarios-simulator | 7× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 5 | net-worth-flow | 21× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 6 | cost-of-living | 9× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 7 | practice-cashflow | 14× `fmtAUD(x*100)` cents inflation | strip `*100` (G4) |
| 8 | **tax-optimizer** | **STALE stage-2 brackets (19% / 32.5%)** — audit #14 | replace with 16% / 30% / 37% / 45% (Feature 2) |
| 9 | insurance-gap | education cost inconsistency ($100k engine vs $200k template) | keep $100k, delete unused STAT_TEMPLATES (Feature 6) |
| 10 | tax-bracket-visualizer | `+ 1` off-by-one in per-bracket slice | drop the `+ 1` (optional, ≤$0.16 impact) |
| 11 | tax-optimizer / tax-bracket | abbreviating `formatAUD` loses dollar precision on tax figures | add local `fmtExact` for precise figures (G4 precision note) |
| 12 | super-optimizer | title copy `$${fmtAUD(CONCESSIONAL_CAP*100)}` doubles the `$` + inflates | `formatAUD(CONCESSIONAL_CAP)`, drop stray `$` |
| 13 | retirement (existing repo file) | `hsl(var(--foreground))` renders transparent (our tokens are hex) | `var(--foreground)` if you touch app.retirement.tsx |
| 14 | all source files | stale "FY 2024-25" UI copy | update to "FY 2025-26" where shown |

> Note: the source files do **not** contain any `hsl(var(--token))` (verified) — bug #13 is in OUR
> existing orphaned retirement route, only relevant if Feature 9 replaces it.

---

## Missing dependencies

**npm packages:** NONE missing. Verified present in `client/package.json` / already imported elsewhere in
the SPA: `recharts@^2.15.3`, `framer-motion`, `sonner`, `lucide-react`.

**shadcn/ui components:** NONE missing. All used by the 11 calculators are present in
`client/src/components/ui/`: button, slider, label, card, badge, select, input, tabs, tooltip, separator,
switch, progress, etc.

**CSS:** ~12 utility classes are missing and must be added once to `client/src/globals.css` — see
Global rule **G6**. This is the only real prep step. (`tracking-display` already exists; do not redefine.)

**score.ts helpers:** `projectRetirement` + `ASFA_SINGLE_TARGET` must be added to `client/src/lib/score.ts`
for Feature 9 only — see **§T9**.

---

## Tools page cards (optional but recommended)

The Tools page is `client/src/routes/_authenticated/app.tools.tsx` (a static `TOOLS` array of external
links rendered as cards). Add an **internal "Calculators"** section above the external links: a second grid
of cards that `Link` (TanStack `<Link to="/app/super-optimizer">` etc.) to each ported calculator. Reuse
the existing card markup pattern in that file (border, rounded-[12px], `bg-[var(--surface)]`, hover border).
One card per ported feature, with its label + a one-line description. This surfaces the calculators even
before they're in the sidebar.

---

## Final acceptance (whole port)

- `cd client && npx tsc --noEmit` — clean.
- `cd client && npx vite build` — succeeds; commit built assets under `public/app/` per repo convention.
- Every ported route loads under `/app/<name>` behind auth, renders its chart/controls, and shows **no
  100×-inflated currency** anywhere.
- tax-optimizer shows a **37% marginal rate at $180k** (proves the stage-3 bracket fix landed).
- All new routes appear in the sidebar TOOLS group and as cards on the Tools page.
