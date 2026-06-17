# Maal Financial Health Score — Algorithm Specification v2

> Version: 2.0 (2026-05-23)
> Owned by: Maal (Polsia)
> Audience: Engineering team, product team

---

## Overview

The Financial Health Score is a 0–100 composite score for Australian health professionals. It evaluates the user's financial position across 7 weighted components and outputs a grade, diagnosis, personalised action plan, plus two supplementary scores: Halal/Ethical Compliance Score and Portfolio Health Score.

The score is **explainable** — every point maps to a specific, auditable input. No black-box ML. The logic is fully documented and human-interpretable.

---

## Part 1 — Financial Health Score (0–100)

### Components & Weights

| # | Component | Max pts | Weight | What it measures |
|---|-----------|--------:|-------:|------------------|
| 1 | Debt Ratio | 20 | 20% | HECS + consumer debt as % of gross income |
| 2 | Super Adequacy | 20 | 20% | Current balance vs ASFA comfortable benchmark for age |
| 3 | Savings Rate | 15 | 15% | Monthly savings as % of gross monthly income |
| 4 | Emergency Fund | 15 | 15% | Months of expenses covered by liquid savings |
| 5 | Investment Diversity | 10 | 10% | Non-super portfolio concentration and breadth |
| 6 | Retirement Readiness | 10 | 10% | Projected super at target age vs comfortable target |
| 7 | Insurance Coverage | 10 | 10% | Income protection + life/TPD + professional indemnity |

**Total: 100 points**

### Grade Thresholds

| Score | Grade | Description |
|------:|-------|-------------|
| 85–100 | Excellent | Strong foundations, ahead of peers |
| 70–84 | Good | Solid trajectory, minor gaps |
| 55–69 | Fair | Core foundations present, gaps compound silently |
| 40–54 | Needs Work | Structural gaps need focused attention |
| 0–39 | Critical | Vulnerabilities require immediate action |

---

## Part 2 — Component Formulas

### 2.1 Debt Ratio (20 pts max)

**Formula:** `totalNonMortgageDebt / annualIncome`

Where `totalNonMortgageDebt = HECSBalance + OtherConsumerDebt`

Mortgage is excluded (property asset, separate risk profile).

**Scoring table:**

| Debt/Income ratio | Points |
|-------------------|--------:|
| ≤ 10% | 20 |
| 10–30% | linear: 20 → 8 |
| 30–50% | linear: 8 → 2 |
| > 50% | 0 |

**HECS context:** HECS is not high-interest but does compound at CPI annually. Users above $119,882/year have compulsory repayments withheld by employer — this is factored into the HECS Strategy recommendation only.

---

### 2.2 Super Adequacy (20 pts max)

**Formula:** `superBalance / ASFABenchmark(age)`

Where `ASFABenchmark(age)` is from the ASFA Comfortable Retirement Standard (2025, single person):

| Age | Benchmark |
|----:|----------:|
| 25 | $12,000 |
| 30 | $55,000 |
| 35 | $110,000 |
| 40 | $185,000 |
| 45 | $270,000 |
| 50 | $370,000 |
| 55 | $475,000 |
| 60 | $570,000 |
| 65+ | $640,000 |

**Scoring table:**

| Balance vs Benchmark | Points |
|----------------------|--------:|
| ≥ 100% | 20 |
| 20–100% | linear: 0 → 18 |
| < 20% | 0 |

At or above benchmark: 18 pts (some headroom above target earns bonus).
Above benchmark: 20 pts.

---

### 2.3 Savings Rate (15 pts max)

**Formula:** `monthlySavings / (annualIncome / 12)`

**Scoring table:**

| Savings rate (% of gross monthly income) | Points |
|------------------------------------------|--------:|
| ≥ 20% | 15 |
| 5–20% | linear: 3 → 15 |
| < 5% | linear: 0 → 3 |

The 20% target aligns with ASFA comfortable retirement spending data for high-income earners.

---

### 2.4 Emergency Fund (15 pts max)

**Formula:** `emergencyMonths / 3 * 15`

Where `emergencyMonths` = how many months of expenses the user's liquid savings covers.

Monthly expenses = `annualIncome / 12` (conservative, lifestyle-based proxy).

**Scoring table:**

| Months covered | Points |
|----------------|--------:|
| ≥ 3 months | 15 |
| 0–3 months | linear: 0 → 15 |
| 0 months | 0 |

3 months is the standard financial planning target.

---

### 2.5 Investment Diversity (10 pts max)

**Input:** `investmentAllocation` — JSON array of `{ assetClass, percentage }`

**Scoring rules:**

| Conditions | Points |
|------------|--------:|
| ≥ 4 asset classes, largest ≤ 40% | 10 |
| ≥ 3 asset classes, largest ≤ 50% | 7 |
| ≥ 2 asset classes, largest ≤ 60% | 4 |
| 1 asset class, or largest > 60% | 1 |
| No investments entered | 5 (neutral) |

Concentration risk is the primary signal. Crypto is treated as a distinct asset class (not aggregated with shares).

---

### 2.6 Retirement Readiness (10 pts max)

**Formula:** Projects forward from today to `retirementAge` using compound growth.

**Inputs:** currentSuperBalance, annualIncome, employerContribRate, salarySacrificeMonthly, currentAge, retirementAge

**Model assumptions:**
- Net real return: 6.5% p.a. (industry baseline for super projections)
- Contributions grow at 2% p.a. (real wage growth)
- Fees/tax drag: 15% applied as scaling factor on contributions

**Required balance:** `ASFA_ANNUAL_SPEND × 20` = $65,000 × 20 = **$1,300,000**

This represents the drawdown pool needed to fund a comfortable retirement (~$65k/year for 20 years), consistent with ASFA's comfortable retirement standard.

**Scoring table:**

| Projected / Required ratio | Points |
|---------------------------|--------:|
| ≥ 100% | 10 |
| 75–99% | linear: 7 → 9 |
| 50–74% | linear: 5 → 7 |
| 25–49% | linear: 0 → 5 |
| < 25% | 0 |

**Edge case:** If `currentAge ≥ retirementAge`, score is based purely on current balance vs required balance.

---

### 2.7 Insurance Coverage (10 pts max)

Three coverage dimensions, weighted:

| Dimension | Max pts | Scoring |
|-----------|--------:|---------|
| Income Protection | 4 | full (4) / partial (2) / none (0) |
| Life + TPD | 3 | full (3) / partial (1) / none (0) |
| Professional Indemnity | 3 | full (3) / partial (1) / none (0) |

**User input:** `insuranceCover` enum — `'full'` | `'partial'` | `'none'`

`'full'` = has income protection cover (the primary signal for health professionals).

This component is binary in the form but the scoring is granular — a future form update could expose the three sub-dimensions individually.

---

## Part 3 — Supplementary Scores

### 3.1 Halal/Ethical Compliance Score (0–100)

**Formula:** `sum(percentage where halal=true) / totalPercentage × 100`

**Input:** `investmentAllocation` — JSON array of `{ assetClass, percentage, halal }`

**Asset classification rules:**

| Category | Keyword matches | Credit |
|----------|-----------------|--------|
| Halal/Ethical | `islamic`, `halal`, `shariah`, `ethical`, `esg`, `green`, `renewable`, `sustainable`, `gold` | 100% |
| Non-compliant | `crypto`, `gambling`, `alcohol`, `pork`, `bank` (unscreened), `conventional` | 0% |
| Ambiguous | anything not matching above | 50% |
| No allocation entered | — | 50 (neutral) |

A separate `halal` boolean field on each allocation item allows precise classification when the user specifies it directly.

---

### 3.2 Portfolio Health Score (0–100)

Three dimensions, equally weighted (33%/33%/33%):

**1. Concentration Risk (max 33 pts)**
`score = max(0, 33 - max(0, largestPct - 40))`
Penalises portfolios where any single holding exceeds 40%.

**2. Liquidity (max 33 pts)**
`liquidPct` = sum of liquid asset percentages:
- High liquidity (cash, gold, ETF, shares): 100%
- Medium liquidity (bonds, managed funds): 50%
- Low liquidity (property, crypto, infrastructure): 0%
`score = (liquidPct / total) × 33`

**3. Cost Efficiency (max 33 pts)**
Average management fee in basis points (bps):
`score = max(0, (1 - avgFeeBps / 100) × 33)`
Assumes 0.6% (65 bps) as the default if fee data not entered.

---

## Part 4 — Australian Regulatory Thresholds

Used in recommendations only (not scoring):

**HECS/HELP compulsory repayment thresholds (FY2024–25, ATO):**

| Income from | Income to | Repayment rate |
|------------:|----------:|---------------:|
| $0 | $45,881 | 0% |
| $45,882 | $55,787 | 7% |
| $55,788 | $119,882 | 12.5% |
| $119,883 | $157,202 | 17.5% |
| $157,203 | $183,723 | 23% |
| $183,724+ | — | 31% |

**HECS indexation:** Annual CPI indexation applied each April. FY25 rate ~3.8%.

**Medicare Levy Surcharge (MLS) thresholds:**

| Income above | Surcharge |
|-------------:|----------:|
| $105,000 (single) | 1.5% of income |

**Superannuation Guarantee:**
- FY25: 11.0%
- FY26: 11.5%
- FY27: 12.0%
- Concessional cap: $30,000/year
- Non-concessional cap: $120,000/year

---

## Part 5 — Action Plan Logic

The recommendation engine generates a prioritised list of up to 3 actions.

**Priority 1** (impact score = 1):
- Emergency fund < 2 months
- Consumer debt at >12% APR with balance > 15% of income

**Priority 2** (impact score = 2):
- Super adequacy < 60% of benchmark
- Retirement readiness < 70%
- Savings rate < 12% (income > $50k)
- Income > $119,882 with HECS > 1× income
- MLS exposure ($105k+) without private health cover

**Priority 3** (impact score = 3):
- Insurance cover absent or partial
- Investment diversity < 70% of max score

Actions are sorted by impact score (1 first), then by the severity of the underlying component score.

The system falls back to generic financial hygiene recommendations (insurance review, fee-only adviser, super fund switch) if fewer than 3 actionable recommendations are triggered.

---

## Part 6 — Input Variables Reference

| Variable | Type | Source | Required | Notes |
|----------|------|--------|:--------:|-------|
| `age` | number | Form step 1 | ✓ | 18–80 |
| `profession` | string | Form step 1 | ✓ | Label only, no scoring weight |
| `annualIncome` | number | Form step 2 | ✓ | Gross, pre-tax |
| `hecsBalance` | number | Form step 2 | — | 0 if none |
| `otherDebtBalance` | number | Form step 2 | — | Credit cards, personal loans, car |
| `otherDebtRate` | number | Form step 2 | — | APR %, 0 if none |
| `superBalance` | number | Form step 3 | — | Current fund balance |
| `employerContribRate` | number | Form step 3 | — | %, default 11 |
| `emergencyMonths` | number | Form step 3 | — | Months covered |
| `monthlySavings` | number | Form step 3 | — | Post-tax, pre-super |
| `retirementAge` | number | Future form | — | Default 65 |
| `salarySacrificeMonthly` | number | Future form | — | Monthly extra to super |
| `investmentBalance` | number | Form step 4 | — | Total non-super investments |
| `investmentAllocation` | JSON array | Future form | — | Per-asset breakdown with % |
| `insuranceCover` | enum | Future form | — | 'full' / 'partial' / 'none' |
| `privateHealthCover` | boolean | Future form | — | For MLS recommendation |

---

## Part 7 — Output Schema

```json
{
  "score": 73,
  "grade": "Good",
  "components": {
    "debtRatio": 16,
    "savingsRate": 11,
    "emergencyFund": 15,
    "superAdequacy": 18,
    "insuranceCoverage": 0,
    "investmentDiversity": 7,
    "retirementReadiness": 6
  },
  "diagnosis": "As a Doctor earning $185,000, your Financial Health Score is 73/100 — good. You are on a solid trajectory with a few targeted improvements that could accelerate your wealth significantly. Your highest-priority area is improving your insurance protection, with retirement readiness at your target age as the next focus.",
  "recommendations": [
    {
      "impact": 1,
      "title": "Protect your income with insurance cover",
      "detail": "As a health professional, income protection is your most important financial safety net..."
    },
    {
      "impact": 2,
      "title": "Salary sacrifice to close your super gap",
      "detail": "Your super is $32,000 below the ASFA benchmark for a 38-year-old..."
    },
    {
      "impact": 2,
      "title": "Review Medicare Levy Surcharge exposure",
      "detail": "Earning above $105,000 puts you in the 1.5% MLS zone..."
    }
  ],
  "halalComplianceScore": 72,
  "portfolioHealthScore": 68
}
```

---

## Part 8 — Score Integrity Rules

1. **All inputs are coerced to numbers** — empty strings, null, undefined default to 0 (except booleans/enums)
2. **No negative values accepted** — `Math.max(0, value)` on all financial inputs
3. **Age bounded** — `Math.max(18, Math.min(80, age))`
4. **Score is always an integer** — all `Math.round()` in the output
5. **Score capped at 100** — no overflow possible from sum of components
6. **Recommendations always return 3 items** — padded with generic defaults if fewer actionable

---

## Appendix A — Changelog from v1

| Component | v1 weight | v2 weight | Change |
|-----------|----------:|----------:|--------|
| Debt Ratio | 20% | 20% | ✅ Unchanged |
| Super Adequacy | 15% | 20% | ↑ Increased (the core differentiator) |
| Savings Rate | 15% | 15% | ✅ Unchanged |
| Emergency Fund | 15% | 15% | ✅ Unchanged |
| HECS Strategy | 10% | — | ❌ Merged into Debt Ratio + Recommendation |
| High-Interest Debt | 10% | — | ❌ Merged into Debt Ratio + Recommendation |
| Investment Diversification | 15% | 10% | ↓ Decreased |
| — | — | 10% | 🆕 Insurance Coverage added |
| — | — | 10% | 🆕 Retirement Readiness added |

**New outputs in v2:**
- `halalComplianceScore` (0–100)
- `portfolioHealthScore` (0–100)
- 7-component breakdown (was 7, now different set)
- MLS recommendation for earners > $105k
- Voluntary HECS repayment recommendation for high earners