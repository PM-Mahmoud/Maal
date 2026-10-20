# CFO Silvia — full teardown (2026-10-21, two passes)

**Design system:** see `cfosilvia-design-system-2026-10-21.md` (palette, type, spacing, components).
**Earlier work:** `cfosilvia-competitive-teardown-2026-07-09.md` (July click-through + build plan).

## Method and coverage

Tool: [REA](https://github.com/morluto/rea) v6.7.0 CLI (`npm i rea-agents`, run locally, not
registered via `setup`), against a disposable Chrome profile logged into a Silvia **test account**
(Free tier), plus a cookie-less context for the public site.

| Pass | What ran |
|---|---|
| 1 | `analyze-web-bundle` on /dashboard (163 scripts) · `inspect-web-page` · HAR of 10 routes → `inspect-web-network-capture` |
| 2 | `analyze-web-bundle` on **35 routes** (203 unique scripts + full webpack runtime chunk map) · RSC probing of ~80 candidate paths · client route manifest (121 paths) · interactive walk of every modal/tab/menu (~120 screenshots) · Settings ×7 · dark mode · mobile 390px · logged-out marketing site · in-app changelog (Oct 2025 → Oct 2026) and roadmap · design-token extraction |

Kept: routes, endpoint names, response **shapes**, UI copy, public pages. Not kept: their code or
account values. **Not covered:** the contents of stored chat transcripts (blocked by the
auto-mode safety classifier, not bypassed), live chat streaming, the Google/Plaid/QuickBooks
connect flows, Max-tier features, and the native mobile app.

Confidence: **observed** = seen live · **static** = in shipped JS, not exercised · **stated** = Silvia's own copy · **inferred** = our reading.

---

## 1. Company and positioning

- **Who:** Silvia, Inc. Chairman/CEO **Anthony Pompliano** (stated, AI Lab page / Squawk Box). Founder "Shain" (Shain Noor) runs office hours and personal setup for Max users. Head of AI: Jacob Weiss. Site claims "NASDAQ: SVIA" and links investors.cfosilvia.com. *(stated)*
- **Pitch:** "Your personal AI CFO. Built by investors, for investors." Aimed at **wealthy, serious investors**: "Trusted by 20,000+ investors · $60B+ assets tracked · **$2.5M average net worth**". Brand voice is literary, "old money": "Silvia has one client. You are it." / "Silvia is, in practice, eight people" (wealth manager, CFO, bookkeeper, risk officer, estate planner, research analyst, research desk, senior partner). *(stated)*
- **Pricing:** Free $0 · **Pro $20/mo or $200/yr ($17/mo)** · **Max $200/mo** (10× Pro usage, personal setup with the founder, early access). Free has watermarked artifacts, limited usage, and bank refresh pauses after 30 days of inactivity. *(stated)*
- **Wealth funnel → own fund:** `/sam` = **Silvia Asset Management, "Silvia Innovation Fund I, L.P."**, a private VC fund (AI, defence tech, hardware, health, software) marketed in-app to users who pass a **net-worth eligibility check** (`/api/sam/eligibility`, `attestation`, `subscription-interest`, banner, webinar RSVP). The free AI CFO also works as a **lead-gen engine for an asset-management business**. *(observed)*
- **SEO / lead-gen surface:** ~60 financial calculators (US-specific: 401k, Roth, FHA, RMD…), 132 blog posts, 30 `/help/connect-<bank>` guides, `/institutions`, a 150+ prompt library (`/prompts`), and six quizzes (`/investing-iq-test`, `/tax-intelligence-test`, `/retirement-readiness-quiz`, `/debt-knowledge-quiz`, `/portfolio-knowledge-test`, `/financial-planning-assessment`). Also `/wrapped` ("Silvia Wrapped 2025", year in review), `/events`, `/financial-literacy`. *(observed)*
- **AI research as marketing:** `/ai-lab` ("Silvia Labs") publishes papers (adaptive model routing, a tax-accuracy benchmark released openly as `silvia-tax-bench` CC BY 4.0) and runs an invite-only blind-review study. `/ai-transparency` is an EU AI Act Art. 50–style statement. *(observed)*
- **Hints of international:** pricing-page example prompt mentions a UK "ISA allowance"; `display-currency-v01` and `international-phone-v01` experiments; "Foreign currencies" is on the roadmap. Today the product is **US-only in substance** (US tax residency, US states, IRS sources). *(observed)*

## 2. Stack

| Layer | What | Conf. |
|---|---|---|
| Frontend | Next.js App Router on Vercel (RSC, `/_vercel/insights`), React, shadcn/ui + Tailwind, custom "modulus" design system | observed |
| Auth | Clerk (Apple + Google social; webview-specific sign-in experiments) | observed |
| DB | Supabase (66 refs in client) + server routes | static |
| Analytics / flags | PostHog, proxied first-party at `/ingest` (surveys, dead-click autocapture, web-vitals, session replay) | observed |
| Errors | Sentry, proxied at `/monitoring` | observed |
| Cache / rate limit | Upstash | static |
| Storage | S3 (research reports) | observed |
| Email / SMS / voice | Resend (email) · Twilio + **Linq** (SMS, assigned numbers, voice notes) · **ElevenLabs** (voice calls) — the in-app "Silvia status" panel lists exactly these three | observed |
| Voice input | OpenAI Realtime, model `gpt-realtime-whisper`, browser WebSocket with a server-minted session | static |
| Video | **Hyperframes** player (`@hyperframes/core`) + `/api/hyperframes-render` → MP4 ("Magic Moment" finance videos) | static |
| Workspace connector | **Trove**: user links a Trove workspace + namespace (`/api/integrations/trove/{status,namespaces,disconnect}`, hidden `/settings/trove`); the agent reads it through the `trove_*` tools | observed/static |
| Aggregation | Plaid (10k+ institutions), SnapTrade (brokerages), Coinbase (direct), crypto wallets (10+ chains, ENS), Zillow (homes), KBB (vehicles), QuickBooks (businesses), Crunchbase (private cos), Gmail / Calendar / Drive (Google OAuth) | observed/static |
| Market data | Finnhub (news, quotes, `execute_finnhub` tool), Exa (web/quote sources) | observed/static |
| PII | Field-level encryption with key versioning (`first_name_key_version`) | observed |
| Native app | Web app in a **WebView shell** (`webview-*` experiments for email-first signup, Apple sign-in, connect-escape); push notifications in Settings | static |

## 3. AI architecture

- **Model: Claude.** "Silvia's replies are written by Claude, made by Anthropic. Under our zero data retention agreement, Anthropic doesn't store your conversations." (Settings › Privacy, also in the bundle). Client code has an `[anthropic-stream]` reader. *(stated + static)*
- **Single agent + harness.** Their own paper: every chat turn runs on "the most capable … frontier model", in a harness (tools + control loop + context management); a quick lookup and a deep-research report differ only in **loop depth L**, at ~**18–20 s per loop**. *(stated, AI Lab)*
- **Adaptive model routing:** a 0.34 ms hashed-n-gram classifier predicts loop depth from the question (plus "effort momentum" from earlier turns) and sends shallow turns to a smaller model. Short-routing precision 0.74 at 50% coverage, ~0.90 on the most confident slice. *(stated)*
- **Tax harness:** a curated library of tax law (IRC, Treasury regs, IRS pubs, state codes) + web search. On their 200-question benchmark it gave +2.13 accuracy and +3.40 grounding versus no tools; the library mainly made answers **checkable** (citations). *(stated)*
- **Agent toolset**, from the chat UI's tool-icon/label map in shipped JS *(static)*:

| Group | Tools |
|---|---|
| User data | `execute_sql` ("Analyzing your portfolio"), `query_sql`, `export_sql`, `update_personal_info`, `upload_documents`, `view_images` |
| Compute | `code_execution`, `bash_code_execution`, `text_editor_code_execution` (Claude code-execution tool), `execute_python`, `quant_analyst` (sub-agent) |
| Knowledge | `trove_bootstrap`, `trove_list_dir`, `trove_search`, `trove_read` (document/library store), `read_tax_authority` ("Reading IRS documentation"), `read_mortgage_authority`, `read_credit_card_document` ("Reading card terms"), `skills`, `search_skills` (Claude Agent Skills) |
| Web / market | `web_search`, `search_web`, `read_url`, `fetch_url`, `execute_finnhub` |
| Google / business | `gmail_search`, `gmail_read`, `gmail_draft`, `gmail_send_draft`, `gmail_manage`, `google_calendar`, `google_drive`, `quickbooks` (Gmail actions gated by `/api/google/tool-approval`) |
| Output / handoff | `present_artifact` ("Preparing file"), `send_email`, `chat`, `radar`, `report_error`, `get_current_time` |

- **Context management:** auto-summarise and fork into a fresh session when the context fills (`parentSessionId` / `forkedToSessionId`, `latestInputTokens`). *(observed + changelog May 2026)*
- **Memory:** "She remembers everything" in marketing; a "What do you remember about me?" chat exists in the test account. Custom instructions (500 chars, Oct 2025). *(observed/stated)*
- **Outputs:** generative UI (charts/tables in chat, saveable to dashboard), inline source pills with publisher logos plus a Sources widget, LaTeX math, **artifacts** (PDF/XLSX/DOCX/images/charts/JSON/MP4) collected in Vault › "Silvia's Work", email/SMS/WhatsApp share. *(observed/changelog)*
- **Training:** opt-out "Model training" toggle using de-identified data; Google data never used. *(stated)*
- **Channels:** web, SMS (incl. voice notes and images → Vault), email in/out, voice calls, push. Usage is metered in **tokens** across `chat, radar, research, feed, analyst, sms, email`. *(observed)*

## 4. Information architecture

**App routes** (observed via RSC + route manifest): `/dashboard` · `/chat/[[...sessionId]]` · `/research` · `/radar` · `/assets-liabilities` (Portfolio | Accounts | Assets | Liabilities tabs) · `/accounts`, `/accounts/[accountId]` · `/assets`, `/liabilities` · category pages `/cash`, `/public-investments`, `/private-investments`, `/crypto-holdings`, `/real-estate`, `/precious-metals`, `/vehicles`, `/collectibles`, `/other-assets`, `/businesses` (+ `/assets-liabilities/{credit-cards,loans,other-liabilities,…}`) · `/transactions` · `/subscriptions` · `/goals` · `/vault` · `/product-updates` · `/settings/*` (modal) · `/connect-account`, `/connection-status`, `/oauth/plaid` · `/onboarding`, `/post-onboarding-checkout` · `/sam` · `/wrapped` · `/prompts` · `/portfolios`, `/portfolios/manage` (behind the `multi-portfolio-v01` flag) · `/xray` (404 for us, behind a flag) · `/demo-access`, `/outage`, `/sms-opt-in`, `/unsubscribe`, `/account-deleted`.

**Sidebar:** Dashboard, Ask Silvia, Research, Radar, Portfolio, Vault, Transactions, Goals | Support, Roadmap, Community (external `community.cfosilvia.com`) | Silvia Pro | profile menu (Settings, Privacy mode, Log out).

## 5. Page by page (what a user sees)

- **Dashboard:** serif "Welcome, {name}", range select (30 Days), **Customize** (drag/remove widgets via red − badges), **+ Add** (asset | liability). Tiles: Net Worth, Investments/Crypto/Precious Metals (dropdown to switch category), Total Debts, Total Cash, each with a sparkline and delta. Widgets: Radar (empty-state explainer), Ask Silvia (suggested questions), assets/liabilities breakdown, transactions (Outgoing/Incoming), top holdings, market news (Finnhub), SPY index history, saved chat widgets. Floating chat bubble with a proactive greeting.
- **Portfolio (`/assets-liabilities`):** tabs Portfolio / Accounts / Assets / Liabilities; net worth with delta; search; KPI tiles **Assets · Debts · Debt-to-asset ratio ("Healthy")**; performance area chart; collapsible account groups. **Add asset** has 10 types: Banks & Brokerages, Real Estate, Vehicles, Crypto, Public Holdings, Private Investments, Precious Metals, Collectibles & Luxury, Other, **Business** (QuickBooks). **Add liability:** Credit Cards, Mortgages & Loans, Other. Accounts table: name, available, type, updated, balance; **hidden accounts** with restore.
- **Account detail (`/accounts/[id]`):** back link, serif name, balance, "Cur8 Capital · brokerage · Manual", range + Edit, balance history chart, recent activity timeline. Category pages each have an empty state (e.g. "Track homes … synced from Zillow … with linked mortgages for a live equity picture").
- **Transactions:** Last 30 Days / All Accounts filters, + Add; Outgoing / Incoming / Net Cashflow tiles; **spending calendar heatmap** (2 weeks, expand to month); spending donut with category drill-down; search, **Bulk Edit** (up to 500), **All transactions | Subscriptions** toggle, category filter, amount range, sortable table. `/subscriptions` has monthly/yearly spend, upcoming payments in 7 days, and active count.
- **Goals:** total + active/completed counts; goal cards with progress. **Create goal** form: name, description, type **Grow / Save / Pay Off / Invest**, **Source** (Net Worth, Total Cash, Total Debts, or any specific account), current, target, **% of source**, target date, and a live hint "Save $X/mo to hit this target on time".
- **Ask Silvia (`/chat`):** serif time-of-day greeting; composer with mode switch Chat / Research / Radar; **low-data warning** chip ("Not enough assets & liabilities … I cannot provide advice"); Suggested | Artifacts tabs; right **History** panel (Chat | Artifacts, full-text search, pinned, "Older").
- **Research:** "What should I look into?" + "returns a cited report in **20 to 40 minutes**"; same composer in Research mode; Suggested | Reports; right panels **Research History** and **Suggested Research** categories (Market Scenarios, Simulations, Portfolio Analysis, Risk Assessment, Spending Insights, Buy a home, +4). Suggestions: Monte Carlo retirement, concentration + rebalancing, stress test, largest-holding thesis/trim, multi-year Roth conversions + tax-loss harvesting, rent-vs-buy over 10 years.
- **Radar:** 3-card explainer (Tell Silvia what to watch → watches daily/weekly/monthly → Email/SMS "No trigger, no noise"); **Create** opens `/chat?mode=radar` (radars are created conversationally); Suggested / **Top** (curated by net worth, mostly Pro-locked) templates: holding drift 5%, next tax bracket, single-day move >2%, expense >$2k, NVDA ±5%, cash runway <6 months. Feed has Skipped view and unread counts.
- **Vault:** collections (drag-reorder, expand), "Upload files to [collection]" dropzone (images/PDF/Word/CSV, **max 5 GB per file**), "Silvia's Work" folder for generated artifacts, search/filter/sort.
- **Settings (modal):** **General** (name, email, phone + international, DOB, Appearance System/Light/Dark, referral link) · **Profile** (marital status, citizenship, dependents, tax residency country/state/city/ZIP, filing status, capital-gains rate, employment, occupation, income, retirement age, risk tolerance, experience, horizon; "Personal financial statements have moved to chat") · **Goals** (8 intent checkboxes: retirement, wealth growth, income, home, education, emergency fund, debt paydown, legacy) · **Billing** (plans + usage % + reset date + "Get More") · **Security** (2FA SMS/TOTP, SOC 2 Type II, read-only explainer, delete account) · **Privacy** (model-training toggle, Claude ZDR note) · **Notifications** (daily summary email, research-done email, scheduled PFS monthly/quarterly/yearly, marketing, push for chat/research/radar, SMS setup, unread inbox).
- **Product updates:** Changelog (with "Love this" reactions) | Coming next (with "I'd want this" votes) + "Suggest a feature".
- **Mobile:** hamburger + centred logo + rose-gold Upgrade; floating pill bottom nav with a centre chat FAB; tile carousel.

## 6. API surface (126 endpoints: 117 from static analysis, 9 more seen only live)

Grouped below; the full alphabetical list is in the appendix. Pass 2 found 17 endpoints pass 1 missed, mostly in Settings; the 13 category pages added only 1 more, so the static surface looks saturated.
- **User/profile:** `user-info(/update)`, `personal-info`, `preferences`, `account/phone`, `account/delete`, `user/update-location|timezone|mfa-status`, `user/backfill-location`, `user/is-internal`, `user/businesses-access`, `marketing-preferences`, `referrals/get-link|track-from-cookie`, onboarding flags (`artifacts-announcement`, `silvia-2-launch-banner`, `top-radars-announcement`, `statement-notice`, `usage-bar-shown`).
- **Billing/usage:** `me/tier`, `user/token-usage`, `stripe/create-checkout|change-tier|create-portal|switch-to-annual|cancel-scheduled-tier-change`.
- **Chat:** `chat/sessions(/batch|/running)`, `chat/feedback`, `claude/stop`, `realtime-transcription/session`, `google/tool-approval`, `google/permissions`, `gmail/status|disconnect`.
- **Research:** `research/start|sessions|estimate|generate-filename`, `report/markdown`.
- **Radar:** `radar/schedules|results|trigger|insight-preferences|silvia-feed|silvia-simulation|first-run-popup`, `demo/radar`.
- **Data/connect:** `create-link-token`, `plaid/*` (initial-sync-status, connection-failure, migrate-to-snaptrade), `snaptrade(/process-connection|refresh|disconnect)`, `disconnect-bank`, `disconnect-coinbase`, `crypto/add-wallet|fetch-wallet-holdings|resolve-ens`, `fetch-zillow`, `quickbooks/status|snapshots|disconnect`, `crunchbase/company/save`, `integrations/trove/status|disconnect`, `institution-status/all|subscribe`, `connection-attempts`, `items/secure-lookup`, `fetch-balances`.
- **Portfolio/transactions:** `accounts/update-type|update-tax-treatment`, `investments/manual`, `extract-holdings`, `process-holdings-import`, `private-investments/parse-statement`, `portfolios/moves(/preview)`, `portfolios/hidden-accounts/restore`, `manual-transactions(/batch)`, `parse-pdf-transactions`, `transactions/bulk-edit`, `apply-transaction-rule`, `categories/rename`, `category-mapping`, `transaction-categories`, `watchlist(/earnings)`, `market/index-history|price-history`, `fetch-news`, `cash-sweep-notice`.
- **Vault/artifacts:** `vault/silvia-outputs`, `vault/admin-delete(-folder)`, `documents/trigger-processing`, `convert-file`, `hyperframes-render`, `invalidate-cache`.
- **Widgets/system:** `widgets/:id/refresh`, `system-status`, `silvia-status`, `analytics/track-activity`, `error-report`, `notifications/read`, `sms/opt-in`, `onboarding/enroll-linq`, `connect-account/flow-assignment`, `demo-mode`, `changelog/upvote`, `roadmap/upvote`, `sam/*`.

## 7. Experiments in flight (PostHog keys in shipped JS)

`portfolio-detail-pages-v01`, `liability-detail-pages-v01`, `portfolio-public-investments-v01`, `portfolio-page-v01`, **`multi-portfolio-v01`**, `holdings-account-link-v01`, **`display-currency-v01`**, `international-phone-v01`, `dashboard-watchlist-v01`, **`token-limit-outcome-10x-v03`** (launches 2026-10-22; control vs test), `sidebar-token-usage-meter-v01`, `sidebar-cta-location-v01`, `proactive-silvia-greeting-v01`, `task-buttons-v01`, `demo-mode-v01`, `account-connection-security-message-v01`, `webview-email-first-v01`, `webview-apple-signin-v01`, `webview-connect-escape-v01`, plus `landing-page-conversion-v02`.

## 8. Shipping cadence (in-app changelog, condensed)

Roughly **6–14 entries a month**.
- **Oct 2025:** custom instructions, tax-treatment tagging, stop button, estimated-tax-impact widget, 30+ languages, multi-chain wallets.
- **Nov–Dec 2025:** Radar launch, customizable dashboard, referrals, voice-to-text, chat history on the right, cash-runway widget, Webull/Public.
- **Jan–Feb 2026:** Profile page (tax/risk/income), unified assets view, vehicle↔loan link, stock screening ("go deep"), Radar SMS, chat download.
- **Mar–Apr 2026:** **generative UI**, mobile bottom nav, private investments (IRR/MOIC, statement import), global market data (274k funds, 246k bonds), **custom dashboard widgets from chat**, tax answers from the IRC/regs.
- **May–Jun 2026:** inline citations, CSV in chat, auto-summarise long chats, longer thinking, **files emailed to you**, SMS voice notes, research reports inside the chat thread, Radar "Skipped" view.
- **Jul 2026:** **Artifacts**, Top Radars, chat full-text search + pinning, **"Magic Moment" video walkthroughs**, stablecoins "treat as cash".
- **Aug 2026:** account/holding detail pages, multiple mortgages per property, redesigned category pages, Vault search/filters, "Silvia's Work" folder, share to WhatsApp/SMS, +650 institutions, **queue follow-ups while answering** (Pro), System theme.
- **Sep 2026:** **Silvia 2.0 redesign** (16 Sep), bulk edit, manual holdings belong to accounts, bi-weekly auto-updates, US retirement account types, X Money.
- **Oct 2026:** spending calendar, publisher-logo source pills, instant chat switching, **Business assets via QuickBooks**.

**Coming next (voteable):** native mobile app, anonymous peer benchmarking, multi-user access (family/advisor), community prompt library, **action commands** (add assets / categorise / budgets through chat), saved prompts, group/entity (trust/business) management, foreign currencies.

## 9. What Maal already matches

Gateway with a Claude verifier, saved live widgets, research with citations, radar + cron sweep,
vault, roadmap voting, setup checklist + low-data nudge, usage metering, advisor memory + custom
instructions, generative UI, Basiq (≈ Plaid), AU constants as an authoritative library (≈ their tax
library, and arguably better because it is FY-keyed and test-enforced).

## 10. Gaps worth building (AU-mapped), ranked

1. **Background agent runs + inbox-style chat:** runs survive navigation, status/unread/pinned, stop, **queue follow-ups while answering**.
2. **One composer, three modes (Chat / Research / Radar),** with radars created conversationally (`/chat?mode=radar`) instead of a form.
3. **Code execution + SQL-over-own-data tools** for the agent. Their "Analyzing your portfolio" is `execute_sql`; Monte Carlo, stress tests and rent-vs-buy run in code execution. That beats hand-written widget sources for open-ended questions.
4. **Authority readers as tools:** `read_tax_authority` ≈ ATO/ITAA readers over `knowledge_chunks` + `au-constants`; add super/SIS, NCCP/credit-card terms, and Centrelink. Publish an **AU tax benchmark** the way they published silvia-tax-bench, as an earned-media moat.
5. **Artifacts + "Maal's Work" in Vault:** generated PDFs/XLSX, watermarked on Free, download/email on Pro.
6. **Research visibility:** phases, current tool, and an upfront time/cost estimate ("20–40 min"); finished report shown inside the thread.
7. **Detail pages for every account/holding** + category pages (cash, shares, crypto, property with linked mortgages, vehicles, super), plus **debt-to-asset ratio** KPI and **spending calendar heatmap**.
8. **Goals with a "source"** (any account or aggregate) and a "% of source" target, with a live "save $X/mo" hint.
9. **Adaptive model routing** (cheap classifier → small vs frontier model): Maal's gateway already has roles, so this is a small step and cuts AI cost.
10. **Channels:** SMS voice notes, files emailed on request, scheduled personal financial statement, daily summary email.
11. **AU connectors:** Sharesight/broker CSV (≈ SnapTrade), PropTrack/CoreLogic/Domain (≈ Zillow), RedBook (≈ KBB), Xero (≈ QuickBooks), crypto as-is, super funds via CDR.
12. **Growth surface:** AU calculators (super, HECS, negative gearing, FHSS, stamp duty), quizzes, `/help/connect-<AU bank>` guides, an "AI transparency" page, a year-in-review "Wrapped".
13. **Trust copy** like their Security/Privacy tabs: read-only explainer, model-training opt-out, zero-retention statement for the LLM provider.

**Don't copy:** the US tax/retirement scaffolding, the wealth-gated private-fund upsell (AFSL/ASIC
implications in AU), or the "she is eight people" adviser framing. Under Maal's no-advice
disclaimer, keep positioning educational.

---

## Appendix A: all API endpoints observed (126)

`/api/account/delete` · `/api/account/phone` · `/api/accounts/update-tax-treatment` · `/api/accounts/update-type` · `/api/analytics/track-activity` · `/api/apply-transaction-rule` · `/api/cash-sweep-notice` · `/api/categories/rename` · `/api/category-mapping` · `/api/changelog/upvote` · `/api/chat/feedback` · `/api/chat/sessions` · `/api/chat/sessions/batch` · `/api/chat/sessions/running` · `/api/claude/stop` · `/api/connection-attempts` · `/api/convert-file` · `/api/create-link-token` · `/api/crunchbase/company/save` · `/api/crypto/add-wallet` · `/api/crypto/fetch-wallet-holdings` · `/api/crypto/get-crypto-holdings` · `/api/crypto/resolve-ens` · `/api/demo-mode` · `/api/demo/radar` · `/api/disconnect-bank` · `/api/disconnect-coinbase` · `/api/documents/trigger-processing` · `/api/error-report` · `/api/extract-holdings` · `/api/fetch-balances` · `/api/fetch-news` · `/api/fetch-zillow` · `/api/gmail/disconnect` · `/api/gmail/status` · `/api/google/permissions` · `/api/google/tool-approval` · `/api/hyperframes-render` · `/api/institution-status/all` · `/api/institution-status/subscribe` · `/api/integrations/trove/disconnect` · `/api/integrations/trove/namespaces` · `/api/integrations/trove/status` · `/api/invalidate-cache` · `/api/investments/manual` · `/api/items/secure-lookup` · `/api/manual-transactions` · `/api/manual-transactions/batch` · `/api/market/index-history` · `/api/market/price-history` · `/api/market/sp500-ytd` · `/api/marketing-preferences` · `/api/me/tier` · `/api/notifications` · `/api/notifications/preferences` · `/api/notifications/read` · `/api/onboarding/enroll-linq` · `/api/parse-pdf-transactions` · `/api/personal-info` · `/api/plaid/cancel-failure-email` · `/api/plaid/connection-failure` · `/api/plaid/initial-sync-status` · `/api/plaid/migrate-to-snaptrade` · `/api/portfolios/hidden-accounts/restore` · `/api/portfolios/moves` · `/api/portfolios/moves/preview` · `/api/preferences` · `/api/private-investments/parse-statement` · `/api/process-holdings-import` · `/api/quickbooks/disconnect` · `/api/quickbooks/snapshots` · `/api/quickbooks/status` · `/api/radar/first-run-popup` · `/api/radar/insight-preferences` · `/api/radar/results` · `/api/radar/schedules` · `/api/radar/silvia-feed?offset=0&limit=1&filter=all` · `/api/radar/silvia-simulation` · `/api/radar/trigger` · `/api/realtime-transcription/session` · `/api/referrals/get-link` · `/api/report/markdown` · `/api/research/estimate` · `/api/research/generate-filename` · `/api/research/sessions` · `/api/research/start` · `/api/roadmap/upvote` · `/api/sam/attestation` · `/api/sam/banner-dismiss` · `/api/sam/eligibility` · `/api/sam/subscription-interest` · `/api/silvia-status` · `/api/sms/opt-in` · `/api/snaptrade` · `/api/snaptrade/disconnect` · `/api/snaptrade/process-connection` · `/api/snaptrade/refresh` · `/api/stripe/cancel-scheduled-tier-change` · `/api/stripe/change-tier` · `/api/stripe/create-checkout` · `/api/stripe/create-portal` · `/api/stripe/switch-to-annual` · `/api/system-status` · `/api/transaction-categories` · `/api/transactions/bulk-edit` · `/api/user-info` · `/api/user-info/update` · `/api/user/artifacts-announcement` · `/api/user/backfill-location` · `/api/user/businesses-access` · `/api/user/connections` · `/api/user/is-internal` · `/api/user/silvia-2-launch-banner` · `/api/user/silvia-2-launch-banner/impression` · `/api/user/statement-notice` · `/api/user/token-usage` · `/api/user/top-radars-announcement` · `/api/user/update-location` · `/api/user/update-mfa-status` · `/api/user/usage-bar-shown` · `/api/vault/admin-delete` · `/api/vault/admin-delete-folder` · `/api/vault/silvia-outputs` · `/api/watchlist` · `/api/watchlist/earnings` · `/api/widgets/:id/refresh`

Live-only (built dynamically, not visible as static strings): `/api/chat/sessions/batch`, `/api/integrations/trove/namespaces`, `/api/market/index-history`, `/api/market/price-history`, `/api/market/sp500-ytd`, `/api/notifications`, `/api/notifications/preferences`, `/api/system-status`, `/api/widgets/:id/refresh`.

Notification preference keys (push): chat_replies, research_ready, radar_alerts, usage_limits, account_connection, documents, referrals, daily_summary, product_updates, marketing.

## Appendix B: REA gotchas (for re-running)

- `inspect-web-page` / `analyze-web-bundle` abort if the tab navigates mid-capture (`target_changed`). Navigate first, then capture; for traffic, record a HAR over CDP and run `rea inspect-web-network-capture <file> har`.
- `analyze-web-bundle` needs `NODE_OPTIONS=--max-old-space-size=8000` (it OOMs at the 4 GB default) and takes ~2–3 min per route.
- Next.js lazy chunks: derive the full chunk list from the `webpack-*.js` runtime; route-page chunks only appear in RSC payloads (`fetch(path,{headers:{RSC:"1"}})`).
- Drive a background tab with `Page.bringToFront`, or synthetic clicks will not register.
- The auto-mode classifier blocks parsing stored chat transcripts; do not try to work around it.
