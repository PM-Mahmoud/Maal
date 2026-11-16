# Figma flows tracker (website redesign)

85 flows in total. Each row: Figma file → owner agent/branch → status.
Status: `todo` · `building` · `built` (on branch) · `tested` · `live` (on hellomaal.com).

Rules for every flow: Australian English, Australian context (AUD, ATO, super, HECS, AU banks via Basiq),
Maal copy only (never the reference app's name, wording, images or logo), partner names never in the repo.

## Session 1 — batch 1, 2026-11-15 (18 flows)

| # | Flow | Figma file key | Agent / branch | Status |
|---|------|----------------|----------------|--------|
| 1 | Onboarding flow (sign up, create account, choose goal, discovery, survey) | lYCk0dAcbGQGZt96GzU9ui | A1 `redesign/onboarding-core` | live (PR #88) |
| 2 | Copying a referral link from onboarding | GHaUsikdoHV310Ao6IjyMO | A1 `redesign/onboarding-core` | live (PR #88) |
| 3 | Connecting an account from onboarding (search institutions, CommBank result, select owner, connecting, connected) | WNi4SaN698WGTaN3zRrUAO | A2 `redesign/connect-accounts` | live (PR #88) |
| 4 | Adding an account | wvTCWTndCsdYldPkqmJGc0 | A2 `redesign/connect-accounts` | live (PR #88) |
| 5 | Subscribing to a plan from onboarding (subscribe, payment processing, payment success) | fzVoKfzZ3UIZbC9iNAqWyK | A3 `redesign/subscribe-complete` | live (PR #88) |
| 6 | Complete onboarding from onboarding (dashboard offer) | 2bSF1LmwzEXhqPVJdcm7Pc | A3 `redesign/subscribe-complete` | live (PR #88) |
| 7 | Home (overview, bank account, add account) | VrkrSUYelDBir0c5Xx7WuI | B1 `redesign/home` | live (PR #88) |
| 8 | Turning on privacy from Home | 01tAtQocFaK01yD8EY19nv | B1 `redesign/home` | live (PR #88) |
| 9 | Hiding a graph from Home | MOIAsGE3WWz9pAfk8KRqHA | B1 `redesign/home` | live (PR #88) |
| 10 | Filtering accounts from Home | xxzZDjpMxicObBAD4Aj9ms | B1 `redesign/home` | live (PR #88) |
| 11 | Weekly recap from Home | f4TvjtjNW1HSFo6AInJuTU | B2 `redesign/briefs` | live (PR #88) |
| 12 | Giving feedback from Weekly recap | 5XCMt3hRxKIQP2SSNazyZ0 | B2 `redesign/briefs` | live (PR #88) |
| 13 | Daily market brief from Home | vufHn29fkvnTPCUS5hK3LV | B2 `redesign/briefs` | live (PR #88) |
| 14 | Chatting with AI (wealth-building conversation, AI responses) | 6PyXnWxO8khmEwEisM6MIF | C `redesign/advisor` | live (PR #88) |
| 15 | AI financial advisor (workspace, advisor pop-up) | bzT7bVOvSGqLAMMLcRbv60 | C `redesign/advisor` | live (PR #88) |
| 16 | Favouriting a chat | wDLIPy1v7maOU8KkyGQRk0 | C `redesign/advisor` | live (PR #88) |
| 17 | Renaming a chat | sxbhvKEPzUtixWTGEHp1Zr | C `redesign/advisor` | live (PR #88) |
| 18 | Deleting a chat | 1QMMEm3NS4aqcLqq21bx6M | C `redesign/advisor` | live (PR #88) |

## Earlier
- Onboarding v2 first pass (frames 01–16 of lYCk0dAcbGQGZt96GzU9ui) — live 2026-11-14 (PRs #84–#87).

## Sessions 2–4 — skipped for now (come back after session 5)

## Session 5 — 2026-11-16 (15 flows, Figma folder "Session 5 (Notifications to Loggin in)"; absorbs session 1's last 6)

Integration branch `redesign/session-5`.

| # | Flow | Figma file key | Agent / branch | Status |
|---|------|----------------|----------------|--------|
| 19 | Settings (account menu) | 9sm4aMNV57N8YlPMVgLZzP | S5-A `redesign/s5-settings` | built |
| 20 | Updating profile from Settings | GMED6uyqybaq7YnoHDy8Wx | S5-A `redesign/s5-settings` | built |
| 21 | Deleting an account from Settings | CSM6a5Tr8a1FSWjSjexKte | S5-A `redesign/s5-settings` | built |
| 22 | Setting up two-factor authentication from Settings (file holds a risk-assessment copy — real 2FA design still needed; email-code 2FA restyled) | U9mxYZzdxlpJJm7Fh0EhGd | S5-B `redesign/s5-security-risk` | built |
| 23 | Completing a risk assessment from Settings | CUkAI3SGv2ZKLYliEXyB7P | S5-B `redesign/s5-security-risk` | built |
| 24 | Notifications | pYQyGJdHqBN9AMTVnSCmhi | S5-C `redesign/s5-notifications-theme` | built |
| 25 | Switching to dark mode | 1mqGFan896h4zXV5VRCSfL | S5-C `redesign/s5-notifications-theme` | built |
| 26 | Spending settings | LUk8sLdS6r5SCvoIgaN97u | S5-D `redesign/s5-spending-settings` | built |
| 27 | Updating transaction settings from Spending settings | CK6YjfQEUKjRF0AmsMU8jb | S5-D `redesign/s5-spending-settings` | built |
| 28 | Deleting a budget from Spending settings | 5pXgKSLHDmG403mDQts3dp | S5-D `redesign/s5-spending-settings` | built |
| 29 | Creating a rule from Spending settings | VufoAtRve4sbettacY829g | S5-E `redesign/s5-rules` | built |
| 30 | Preview matches from Creating a rule | rRSE0eHTc2KYpWW0OFDyL3 | S5-E `redesign/s5-rules` | built |
| 31 | Logging in | 1V4AF22TucvpK04gBXb0Hz | S5-F `redesign/s5-auth` | built |
| 32 | Resetting password from Logging in | K1sI9HQZFjVsPnqVd0beKH | S5-F `redesign/s5-auth` | built |
| 33 | Logging out | HBNv4Mvb9yy4TbkTemym2w | S5-F `redesign/s5-auth` | built |

## Remaining: 33 of 85 built; sessions 2–4 and later to come
