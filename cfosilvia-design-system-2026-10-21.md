# CFO Silvia — design system teardown (2026-10-21)

Captured with computed-style extraction over CDP plus REA page inspection on a logged-in test
account (1440×900 desktop, 390×844 mobile, light + dark) and a cookie-less context for the
marketing site. Values below are **observed tokens and computed styles**, not guesses.
Companion to `cfosilvia-rea-teardown-2026-10-21.md`.

Silvia runs **three visual languages**:

| Surface | Character |
|---|---|
| **App** ("Silvia 2.0", relaunched 16 Sep 2026) | Calm monochrome, warm-neutral greys, serif page titles, black primary buttons, rose-gold for anything premium |
| **Marketing site** | "Old money" editorial: parchment/cream, bronze + gold, statue/marble imagery, high-contrast display serifs |
| **Auth / 404 / "prompt" surfaces** | Black, dark "modulus" theme with rose-gold CTA |

Under the hood there are two token layers: the original shadcn/ui HSL variables + a large custom
RGB-triplet layer (`--surface-*`, `--content-*`, `--edge-*`), and a newer namespaced design system
called **`modulus`** (`--modulus-*`, ~360 tokens) activated via `data-theme-variant="modulus"`.

---

## 1. Typography

### Families (loaded `document.fonts`)
| Role | App | Marketing |
|---|---|---|
| UI / body | **Figtree** 300/400/500/600/700 (fallback system stack) | **DM Sans** 400/500, **Jost** 300/500 (nav) |
| Modulus text | **Inter** (variable 100–900) | Inter (forms) |
| Display / titles | **Cormorant Garamond** 400 (page titles, modal titles, greeting) | **Instrument Serif** (hero), **Fraunces** 300 variable (section heads, italic emphasis) |
| Mono | — | **IBM Plex Mono** (trust strip, eyebrows) |

### App usage (observed on dashboard)
- Body text: Figtree 16px/24px; most UI text **14px/20px** (×77), then 12px/16px, 11px.
- Weights in use: 400 (dominant) › 500 › **300** (widget titles + composer text are *light*).
- Page titles ("Welcome, Mahmoud", "My Portfolio", "Transactions", "Goals", "My Vault"): Cormorant Garamond ~36px, regular, near-black.
- Hero greeting on chat/research ("Good morning Mahmoud.", "What should I look into?"): Cormorant ~56px, tight tracking.
- Widget titles ("Radar", "Ask Silvia"): Figtree **26px weight 300**, letter-spacing −0.65px.
- KPI values ("$54,706"): ~31.7px Figtree regular, letter-spacing +1.27px; delta line 14px green.

### Modulus type scale (tokens)
| Token | Family | Size / line | Weight | Tracking |
|---|---|---|---|---|
| display | Cormorant | 64 / 72 (mobile 48/56) | 400 | −0.02em |
| h1 | Cormorant | 48 / 56 (mobile 36/40) | 400 | −0.02em |
| h2 | Cormorant | 36 / 44 (mobile 28/36) | 400 | −0.01em |
| h3 | Inter | 20 / 28 | 600 | 0 |
| title-modal | Cormorant | 28 / 36 | 400 | −0.01em |
| title-panel | Cormorant | 20 / 28 | 400 | −0.01em |
| body | Inter | 16 / 24 | 400 | 0 |
| body-small | Inter | 14 / 20 | 400 | 0 |
| label | Inter | 14 / 20 | 500 | 0 |
| caption | Inter | 12 / 16 | 400 | 0 |
| eyebrow | Inter | 12 / 16 | 500 | **+0.06em**, uppercase ("ABOUT YOU", "ASSETS") |
| figure-lg | Inter | 36 / 44 | 600 | −0.02em, **tabular-nums** |
| figure-md | Inter | 28 / 36 | 600 | −0.015em, tabular-nums |
| figure-sm | Inter | 20 / 28 | 600 | 0, tabular-nums |

### Marketing type (observed)
- H1 hero: Instrument Serif **64px**, letter-spacing −2.88px, colour #2A352D, with the key word in *italic* ("Build *generational* wealth").
- H2 sections: Fraunces **62px weight 300**, −1.24px, second line in *italic bronze* ("Silvia is, in practice, / *eight people.*").
- H3: Fraunces 25.9px 300.
- Eyebrows: italic serif small caps flanked by em-dashes — "— WHAT SHE REPLACES —" — letter-spacing ~4.5px, bronze.
- Nav: Jost 14px weight 300, white 85% on a black bar.
- Body: DM Sans ~19px, warm grey.

---

## 2. Colour

### App — light (default)
Neutral, slightly warm greys; colour is reserved for data, gain/loss and premium.

| Token | Value | Use |
|---|---|---|
| page / shell | `#F9F9F9` / `#FAFAFA` | app background behind cards |
| surface / card | `#FFFFFF` | cards, modals, composer |
| surface-well | `#F6F6F6` | sidebar, nav pill |
| surface-tile-hover / dip | `#F5F5F5` | hovers |
| sidebar active item | `#E2E2E2`-ish fill (`--tab-active` #EBEBEB) | nav selection — **no accent colour** |
| edge | `#E2E2E2` | borders |
| edge-subtle / panel | `#E9E9E9` | card borders (observed 1px #E9E9E9) |
| edge-emphasis | `#C7C7C7` | stronger dividers |
| content-title / body | `#3D3D3D` (legacy) · modulus text-primary `#202020` | headings / text |
| content-secondary | `#525252` | secondary text (most-used text colour) |
| content-muted | `#6E6E6E` / modulus `#727272` | meta text |
| placeholder | `#8C8C8C` | inputs |
| ink / CTA | **`#000000`** (hover `#202020`, active `#333333`) | primary buttons, FAB, icon buttons |
| gain | `#00A368` (observed text `#287C55`) | positive deltas, sparkline stroke |
| loss | `#D33B3B` (observed `#BE463C`) | negative deltas, delete badges |
| info | `#1C598C` | info text |
| link | `#0A8F66` (hover `#087A57`) | inline links — a deep mint |
| warning | `#B45309` | low-data warning |
| legacy CTA / demo-hint | `#15D49F` mint (hover `#0EB285`, text `#0C212B`) | older accent, still used for demo hints |
| surface-item | `#E7F3F8` | pale blue item highlight |
| surface-highlight / edge-highlight | `#BEEAFF` / `#77CDF6` | selection highlight |
| surface-danger | `#FFDFDF` | destructive backgrounds |

**Premium / "rose gold"** (upgrade button, Pro modal, Max, SAM fund):
| Token | Value |
|---|---|
| rose-gold-100 | `#D7B49B` |
| rose-gold-500 / upgrade-accent | `#B0885F` |
| rose-gold-700 / upgrade-accent-text | `#7D5239` |
| CTA intent gradient | `linear-gradient(180deg, #D7B49B, #B0885F)`, hover `radial-gradient(120% 140% at 50% 0%, #D7B49B, #B0885F)`, text `#202020` |
| sam-gold / -light / champagne | `#AB856C` / `#D7B49B` / `#E8D5B5` |

**Asset-category palette** (charts, chips, donut segments):
| Category | Colour |
|---|---|
| Cash | `#2A9C7C` |
| Public investments | `#3B82F6` |
| Crypto | `#D97706` |
| Real estate | `#8B5CF6` |
| Precious metals | `#0891B2` |
| Private investments | `#6366F1` |
| Vehicles | `#64748B` |
| Collectibles | `#DB2777` |
| Other assets | `#78716C` |
| Credit cards | `#E11D48` |
| Loans | `#D97706` |
| Other liabilities | `#64748B` |

**Modulus chart palette** (newer, muted/earthy): light `#5083C3 · #B77A39 · #057075 · #B86DA0 · #695722 · #503B81`, accent `#4B28A5`; dark `#E6EFFF · #F5DFCE · #B0D9E1 · #E6AFE6 · #BDB18C · #AE9AD0`, accent `#BAA0FF`. Area fill opacity 0.18→0, line width 1.75, baseline dashed 3.

**Neutral ramp (modulus):** 0 `#FFFFFF` · 50 `#F9F9F9` · 100 `#F0F0F0` · 200 `#E2E2E2` · 300 `#CFCFCF` · 400 `#B0B0B0` · 500 `#8F8F8F` · 550 `#727272` · 600 `#6E6E6E` · 700 `#525252` · 800 `#333333` · 850 `#2A2A2A` · 900 `#202020` · 950 `#141414` · 1000 `#000000`.
Status: positive `#4CAF7D`, negative `#E17064`, warning `#E0A44A`, info `#6FB0DC` (each with a 12% alpha bg). Tags: purple `#4B28A5` on `#4800FF59` ("Complete" badge).

### App — dark (Settings › Appearance › Dark, `html.dark[data-theme-variant="dark-variant-b"]`)
Neutral charcoal; primary buttons **invert to white**.
| Token | Value |
|---|---|
| page | `#141414` |
| surface / popover | `#202020` |
| card | `#141414` (raised `#2A2A2A`) |
| edge | `#2A2A2A` (strong `#2D2D2D`, emphasis `#666666`) |
| title / label | `#FFFFFF` |
| body | `#C3C3C3`; muted `#A0A0A0`; faint `#898989` |
| gain / loss | `#53D9B4` / `#FF7A7A` |
| link / cta | `#15D49F` mint |
| user message bubble | white 12% |

There is also an older **teal-navy dark theme** still in CSS (`html.dark` default): page `#00121B`, surface `#031822`, card `#000C12`, edge `#00293E`, text `#BBD3DD`, titles `#95B3C2`. Silvia 2.0 replaced it with the charcoal "variant-b".

### Marketing site
| Role | Value |
|---|---|
| Section background (parchment) | `#D9CFB8` |
| Card / table fill (cream) | `#FBF7EC` |
| Hairlines | `#E6DFCC` |
| Ink (headings) | `#14110D`; hero `#2A352D` (forest) |
| Body | `#3A342A`, `#5A544A`, meta `#8A8275` |
| Bronze accent (italic emphasis, eyebrows, button) | `#B0885F` |
| Gold (dots, runway chart) | `#E9B949` |
| Nav bar | `#0E0B08` near-black |
| Sign-up button | rose-gold gradient |

---

## 3. Shape, elevation, spacing, motion

- **Radius:** control 8px (buttons, inputs, cards observed 8px) · container 16px · surface/modal 20px · tag 4px · pill 9999px (avatars, nav pill 24px) · skeleton blocks 3px.
- **Card shadow (signature):** `0 2px 4px rgba(0,0,0,.05), inset -2px -4px 5px rgba(0,0,0,.02)` — a soft lift plus a faint inner shade, on a 1px `#E9E9E9` border.
- **Modulus elevation:** raised `0 2px 8px rgba(0,0,0,.08)`, overlay `0 8px 24px rgba(0,0,0,.12)`; scrim `rgba(0,0,0,.6)` light / `.72` dark. Texture: noise overlay 4%, wash 3%.
- **Spacing:** 4px base (2, 4, 8, 10, 12, 16, 20, 24, 32, 36, 40, 44, 48, 64, 80, 96, 104). Surface padding 24, container 16, panel 8. Field row gap 20, column gap 16. Page top 104px, section gap 48, title gap 64.
- **Layout:** sidebar **260–280px** (rail 72px collapsed), 6-column grid with 24px gutters/margins, form max 400px, reading measure 768px, marketing shell 1200px. Modal widths 440 / 640 / 1120; settings modal ~1120 with a 264px left nav. Tile min-width 288px.
- **Controls:** heights 18 / 24 / 32 / 36 / 44; padding-x 12 / 16 / 20. Switch 56×24 track with a 30×20 pill knob that stretches to 36 on press; segmented slider knob 70px. Composer heights 112 / 136 / 160px, max 6 lines. Icons 16 / 20 / 24 / 32.
- **Motion:** fast 150ms, base 200ms, surfaces in 400ms / out 300ms, hover-intent delay 500ms, pulse 1400ms. Easing standard `cubic-bezier(0.2,0,0,1)`. Radar illustration strip cycles every 15s in 5s steps.
- **Breakpoints:** 640 / 768 / 1024 / 1280 / 1536.

---

## 4. Components & patterns worth noting

- **Sidebar:** logo wordmark + collapse toggle; nav items with 20px line icons, active = grey fill (no colour); divider; Support / Roadmap / Community; bottom **rose-gold "Silvia Pro" bar** + avatar row (name + tier) opening a menu (Settings, Privacy mode, Log out).
- **Buttons:** primary = black fill, white text, 8px radius, 14px/500, ~36px tall, leading "+" icon ("+ Add", "+ Create Radar"). Secondary = 1px `#202020` outline, same metrics ("30 Days ▾", "Customize"). Premium = rose-gold gradient. Destructive = red circle "−" badges in Customize mode.
- **Stat tile:** title 14px muted + period label top-right, sparkline with soft green gradient fill, delta with arrow, big value; drag handle (⋮⋮) bottom-right. Four across on desktop; **swipeable carousel with dots** on mobile.
- **Empty states:** centred bold sentence + 3-step icon diagram ("Checks on schedule → Pings when it matters → Lands in your inbox") + black CTA.
- **Skeletons:** grey `#ECECEC` blocks, 3px radius, mirroring final layout.
- **Composer (shared by Chat/Research/Radar):** large rounded white box, animated typewriter placeholder, "+" (Add files / Choose from Vault), mode pill ("Chat ▾" → Chat / Research / Radar, each with a hover preview card showing a mini example answer), low-data ⚠ chip, mic, rose-gold send button.
- **Suggestion lists:** plain text rows separated by hairlines under a "Suggested | Artifacts/Reports" segmented control.
- **History panel:** right-side column (Chat | Artifacts tabs, search, "Older" group).
- **Settings:** large modal, left icon nav (General, Profile, Goals, Billing, Security, Privacy, Notifications), right label/field rows split by hairlines, uppercase eyebrows.
- **Upgrade modal:** serif title, checklist with ✓ icons, monthly/yearly radio cards (selected = rose-tinted fill + bronze border, "Best value · 2 months free" tag), Cancel outline + rose-gold primary.
- **Transactions:** filter dropdowns, 3 KPI tiles, **spending calendar heatmap** (blue intensity, "Less ▢▢▢▢ More"), outgoing/incoming donut, sortable table with pagination.
- **Goals card:** icon circle, title, "GROW · NET WORTH" meta, purple "Complete" tag, thick blue progress bar, % in green.
- **Vault:** stacked collection cards (grey fill, drag handle, expand icon), dashed dropzone panel with "DROP FILES HERE" letter-spaced caps, lock + "encrypted at rest and in transit".
- **Mobile:** top bar (hamburger · centred wordmark · rose-gold Upgrade), **floating pill bottom nav** (Home, Portfolio, ⬤ chat FAB centre, Radar, Research).
- **Floating chat bubble** bottom-right on every page with a proactive greeting toast ("Need a summary of your finances? Just ask!").

---

## 5. Compared with Maal's current system

| | Silvia | Maal (Sahha pass, 2026-06-14) |
|---|---|---|
| UI font | Figtree / Inter | Geist |
| Display font | Cormorant Garamond serif titles | Geist bold, tight tracking |
| Palette | Warm monochrome + rose-gold premium + mint link | Monochrome + mint-teal accent `#12B5A6` |
| Primary button | Black, 8px | Black, 8px (same) |
| Charts | Green sparkline + category colours; modulus earthy palette | Monochrome ink |
| Dark mode | Charcoal `#141414`, white primary | `#0A0A0B`, teal `#2DD4C4` |
| Signature | Serif titles, rose-gold premium, inner-shadow cards | 3px teal top bar |

They already look alike in structure (black CTAs, monochrome, 8px radius). Silvia sets itself apart
with **serif display type** and a **rose-gold premium colour**. Maal does not need to copy either:
a distinctive AU identity is worth more than looking the same.
