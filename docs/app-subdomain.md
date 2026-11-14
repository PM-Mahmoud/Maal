# app.hellomaal.com instead of hellomaal.com/app

**Status:** code ready behind a flag, not live · **Written:** 2026-11-15 ·
**Code:** `lib/app-host.js`, `server.js`, `client/src/lib/app-host.ts` ·
**Test:** `test/app-host.test.js` (in `npm test`)

## Short answer

There is no technical reason we can't. The app sat at `/app` only because the
React app and the marketing site are served by the same Express process on the
same host. A subdomain is still the same process: we point `app.hellomaal.com`
at the same service, and Express looks at the `Host` header to decide what to
serve. Everything is behind one env var, `APP_HOST`. **With `APP_HOST` unset,
the site behaves exactly as it does today** (checked request-for-request against
`main`, see "How it was verified").

## How it works

| | `APP_HOST` unset (today) | `APP_HOST=app.hellomaal.com` |
|---|---|---|
| App URL | `hellomaal.com/app/billing` | `app.hellomaal.com/billing` |
| `hellomaal.com/app/*` | the app | 301 → `app.hellomaal.com/*` (query kept) |
| `app.hellomaal.com/app/*` | n/a | 301 → `/*` on the same host |
| Login, sign-up, Google sign-in, `/welcome`, `/r/<code>`, marketing pages | site | site. On the app host these paths 301 to `BASE_URL` |
| `/api/*`, `/billing/*`, `/basiq/*`, Stripe/bank callbacks | site | work on both hosts |
| Logged-out visit to an app page | 302 → `/login` | 302 → `/login` → 301 to the site's `/login` |
| Search engines | — | app host sends `X-Robots-Tag: noindex` |

**Chosen approach: keep the build and the route tree as they are, and rewrite
at the edges.** The React route files are named `app.*.tsx`, so `/app/...`
appears in about 230 places (route ids, `<Link to>`, `navigate`, `useSearch`).
Renaming them all, or building twice with a different Vite `base`, would be a
big change that's hard to test. Instead:

- **Bundle:** unchanged. Vite already builds at base `/` with assets at
  `/assets/*`, and that path works on either host.
- **Server:** when the request host is `APP_HOST`, `index.html` gets a
  `<meta name="maal-app-host">` tag (plus `maal-site-origin` from `BASE_URL`).
  With the flag off, the file is sent untouched with `sendFile`, as before.
- **Router:** `client/src/lib/app-host.ts` reads that tag and passes TanStack
  Router's `rewrite` option. On the app host, public `/billing` ↔ internal
  `/app/billing`. Every existing `<Link to="/app/...">` keeps working, and the
  address bar shows the short URL. On the site, an internal `/app/...`
  navigation (for example the end of `/welcome`) becomes a full page load on
  the app host. With no meta tag there's no rewrite, so the router is exactly
  as before.
- **Clashing names:** on the app host, `/billing` and `/onboarding` are React
  pages, but Express routers with the same names exist. On the app host only,
  the server serves the React app for exactly those two paths. `/billing/success`,
  `/billing/checkout` and the onboarding API are untouched. The `/assets`
  static mount stops redirecting the bare directory, so the Assets page works.
- **Server redirects** (login → app, Stripe cancel/return, billing results,
  bank-connector results, `/dashboard/*` bookmarks, "Open Maal" email links)
  now go through `appUrl(path)` in `lib/app-host.js`. It returns the old
  `/app...` string when the flag is off and `https://APP_HOST/...` when it's on.

## Trade-offs to know about

1. **Cookies across subdomains (the big one).** Today the session cookie is
   host-only. If you sign in on `www.hellomaal.com`, `app.hellomaal.com` can't
   see that session. Set `SESSION_COOKIE_DOMAIN=.hellomaal.com` so one cookie
   covers the site and the app. When that's set, the cookie name changes from
   `connect.sid` to `maal.sid`. Otherwise browsers keep the old host-only
   cookie next to the new one and send both. `express-session` reads the first,
   which can be a dead session, and users get stuck in a login loop. **Cost:
   everyone is signed out once when this goes live.** You can override the
   name with `SESSION_COOKIE_NAME` if you must, but don't reuse `connect.sid`.
   The cookie is still `HttpOnly`, `Secure` (in production) and `SameSite=Lax`.
   The site and app are the same "site" for SameSite, so Lax is fine.
   Any other subdomain of hellomaal.com will also receive the cookie, so don't
   host untrusted content on one.
2. **OAuth, Stripe, bank redirects.** Sign-in stays on the site host, so the
   Google redirect URI you already have keeps working. Stripe `success_url` is
   still `BASE_URL/billing/success`. Only `cancel_url` moves to the app host,
   and Checkout needs no allow-list. Bank-connector callbacks still land on
   `BASE_URL`. All of this relies on the shared cookie from point 1, because
   the user goes site → app mid-flow.
3. **SEO and analytics.** Marketing pages on the app host 301 to the site, so
   nothing is duplicated, and the app host is `noindex`. Analytics will show
   the app on a separate hostname. If your analytics tool filters by host, add
   `app.hellomaal.com`.
4. **Both URLs during the switch.** Old `hellomaal.com/app/...` links,
   bookmarks, emails already sent and `/dashboard/*` bookmarks all 301 to the
   app host. Keep those redirects for at least a year.
5. **Extra hop for logged-out users:** app page → `/login` → site `/login`.
   After login, users land on the app home, not the page they asked for (the
   same as today).
6. **Not changed:** radar alert emails still link to `BASE_URL/dashboard/radar`,
   which redirects to the right place. The `/dashboard/*` redirect drops the
   query string, so `?basiq=queued` on the bank "Sync now" flow is lost. That
   behaviour already exists today and is not changed here.

## Go-live checklist (human steps)

Do these in order. Nothing in the repo needs to change. Where the docs say
"host", that means Render today, or DigitalOcean after
`docs/migration-digitalocean.md`.

**1. DNS (at the registrar or DNS host for hellomaal.com)**
- [ ] Add `app` as a **CNAME** to the same target the site uses. On Render,
      that's the `…onrender.com` hostname shown under Custom Domains. On DO,
      it's the `…ondigitalocean.app` target. Use a low TTL (300 s) for the
      switch.
- [ ] Don't touch the apex or `www` records.

**2. Host: add the domain and TLS**
- [ ] Render: web service → Settings → Custom Domains → add `app.hellomaal.com`
      and wait for "Certificate issued".
      DigitalOcean: App → Settings → Domains → add `app.hellomaal.com` (type
      ALIAS). For a lasting setup, also add it under `domains:` in
      `.do/app.yaml`.
- [ ] Check that `https://app.hellomaal.com/health` returns `healthy`. With the
      flag still off it's the same app, so this proves DNS and TLS only.

**3. Third-party consoles (add, never replace, the existing entries)**
- [ ] Google Cloud Console → APIs & Services → Credentials → the OAuth client:
      add `https://app.hellomaal.com/auth/google/callback` to Authorised
      redirect URIs and `https://app.hellomaal.com` to Authorised JavaScript
      origins. The code sends sign-in to the site, so this is only a safety
      net, but it costs nothing.
- [ ] Stripe: nothing is required for Checkout. If you use a Customer Portal
      return URL or payment-link redirects in the dashboard, point them at
      `https://app.hellomaal.com/billing`. Webhook URLs stay on the site.
- [ ] Basiq: no redirect URL is registered (the consent UI doesn't redirect
      back). Nothing to do. If one is ever set, add the app host.
- [ ] The second bank-data connector (`LUNCHFLOW_REDIRECT_URI` /
      `BASE_URL/lunchflow/callback`): stays on the site. Nothing to do.

**4. Env vars on the host (one deploy)**
- [ ] `APP_HOST=app.hellomaal.com`
- [ ] `SESSION_COOKIE_DOMAIN=.hellomaal.com`
- [ ] `BASE_URL`: leave as the site origin. Use the host users actually end up
      on (`https://www.hellomaal.com` if the apex redirects to www). App-host
      marketing and auth paths redirect here.
- [ ] Deploy. The build runs `npm run build:client`, which includes the router
      rewrite. Expect everyone to be signed out once (new cookie name).

**5. Smoke test (private window, then your normal browser)**
- [ ] `hellomaal.com/app` → 301 → `app.hellomaal.com/` → logged out → site
      `/login`.
- [ ] Sign in with email and password → you land on `app.hellomaal.com/`,
      signed in.
- [ ] Sign out → you land on the site homepage. `app.hellomaal.com/` now asks
      you to log in.
- [ ] Google sign-in from the site → app host, signed in.
- [ ] New sign-up → `/welcome` on the site → finish → app host, signed in.
- [ ] Click through the sidebar: the address bar shows `/advisor`, `/assets`,
      `/billing`, `/onboarding`, `/wealth/super`. Hard-refresh each one. It must
      reload the same page, not a 404 or the old onboarding wizard.
- [ ] `hellomaal.com/app/billing?billing=cancel` → app host with the query
      kept.
- [ ] Billing: start Checkout in Stripe test mode → cancel → back on
      `app.hellomaal.com/billing?billing=cancel`. Complete a test payment →
      `/billing/success` → `app.hellomaal.com/billing?billing=success`.
- [ ] Bank connect → "Sync now" → back in the app, still signed in.
- [ ] `/dashboard/vault` bookmark → `app.hellomaal.com/vault`.
- [ ] `app.hellomaal.com/pricing` → 301 to the site.
      `curl -sI https://app.hellomaal.com/` shows `x-robots-tag: noindex`.
- [ ] A daily-digest or report email's "Open Maal" button opens the app host.

**Rollback:** unset `APP_HOST` and `SESSION_COOKIE_DOMAIN`, then redeploy. The
app is back at `/app`, and users are signed out once more because the cookie
name reverts. The `app` DNS record and the console entries can stay, since
they're harmless. While the flag is off, the app host serves the old
single-host behaviour, so stray visits still work.

## How it was verified

- `test/app-host.test.js`: flag-off strings match the old hard-coded ones
  exactly. It also covers redirect rules for both hosts, cookie config, HTML
  injection (and that a hostile `BASE_URL` is never injected), and server/client
  path-mapping parity.
- 54 requests (27 paths × site and app `Host` headers) against `main` and this
  branch, run with no database. With `APP_HOST` unset, every status code,
  `Location` and body hash was identical. With it set, the redirects matched
  the table above.
- Not verifiable locally (no database): a signed-in session crossing hosts.
  That's what the smoke test above is for.
