import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Wallet, Gauge, Landmark, Sprout, MessageCircle, HelpCircle, Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/api";
import { MaalMark } from "@/components/maal/MaalMark";
import { getReferrals, type ReferralSummary } from "@/lib/referrals.functions";
import "../v2-landing.css";

// /welcome — first-run onboarding (specs/onboarding-v2-membership.md, PR 4).
// Full-screen (no app sidebar). Steps: referral offer → goals → connect banks
// (Basiq) → linked → how did you hear → dashboard. Every step can be skipped.
// Goal / heard-from ids must match lib/welcome.js (server sanitises).

export const Route = createFileRoute("/welcome")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ href: "/login" });
  },
  component: Welcome,
});

type Step = "referral" | "goals" | "connect" | "linked" | "heard";
const ORDER: Step[] = ["referral", "goals", "connect", "linked", "heard"];

const GOALS: { id: string; label: string; icon: ReactNode }[] = [
  { id: "understand", label: "Understand my money", icon: <Gauge className="size-4" /> },
  { id: "debt", label: "Pay down debt", icon: <Wallet className="size-4" /> },
  { id: "super", label: "Grow my super", icon: <Landmark className="size-4" /> },
  { id: "invest", label: "Invest the profit-based way", icon: <Sprout className="size-4" /> },
  { id: "ask", label: "Ask Maal anything", icon: <MessageCircle className="size-4" /> },
  { id: "unsure", label: "Not sure yet", icon: <HelpCircle className="size-4" /> },
];

const HEARD = [
  ["reddit", "Reddit"], ["friends", "Friends & family"], ["google", "Google"], ["x", "X"],
  ["tiktok", "TikTok"], ["streaming_tv", "Streaming TV"], ["instagram_facebook", "Instagram/Facebook"],
  ["event", "Event"], ["other", "Other"],
] as const;

// Australian banks, shown by name only (no logos).
const BANKS: [string, string][] = [
  ["CommBank", "CB"], ["Westpac", "W"], ["NAB", "NAB"], ["ANZ", "ANZ"], ["Macquarie", "M"], ["ING", "ING"],
  ["Bankwest", "BW"], ["St.George", "SG"], ["Bendigo Bank", "B"], ["Suncorp", "S"], ["BOQ", "BOQ"], ["ubank", "u"],
  ["Up", "Up"], ["HSBC", "HSBC"], ["Great Southern Bank", "GSB"], ["Heritage", "H"], ["Bank Australia", "BA"], ["Rabobank", "R"],
];

type LinkedAccount = { id: string | number; institution_name?: string; institution_type?: string };

async function saveProfile(patch: Record<string, unknown>) {
  try {
    await fetch("/api/v1/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch { /* answers are optional; never block the flow */ }
}

function Welcome() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("referral");
  const [firstName, setFirstName] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [heard, setHeard] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [syncedCount, setSyncedCount] = useState(0);

  useEffect(() => {
    fetch("/api/v1/profile", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p?.display_name) setFirstName(String(p.display_name).split(" ")[0]); })
      .catch(() => {});
    fetch("/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u?.name) setFirstName((f) => f || String(u.name).split(" ")[0]); })
      .catch(() => {});
  }, []);

  const go = (s: Step) => { setStep(s); window.scrollTo(0, 0); };
  const next = () => {
    const i = ORDER.indexOf(step);
    // "linked" only follows a successful connection.
    const n = ORDER[i + 1] === "linked" && !linked.length && !syncedCount ? "heard" : ORDER[i + 1];
    if (n) go(n);
  };
  const back = () => {
    const i = ORDER.indexOf(step);
    let p = ORDER[i - 1];
    if (p === "linked" && !linked.length && !syncedCount) p = "connect";
    if (p) go(p);
  };
  const finish = async () => {
    await saveProfile({ heard_from: heard, welcome_completed: true });
    navigate({ to: "/app" });
  };

  const dark = step === "connect";

  return (
    <div className="v2" style={{ background: dark ? "#000" : "#fff", color: dark ? "#fff" : undefined }}>
      <WelcomeStyles />
      <header className={`wl-top${dark ? " is-dark" : ""}`}>
        <button className="wl-chip" onClick={back} disabled={step === "referral"} style={step === "referral" ? { visibility: "hidden" } : undefined}>Back</button>
        <span className="wl-logo"><MaalMark size={16} /><span>Maal</span></span>
        {step === "heard"
          ? <span className="wl-chip" style={{ visibility: "hidden" }}>Skip</span>
          : <button className="wl-chip" onClick={next}>Skip</button>}
      </header>

      <main className={`wl-main${dark ? " is-dark" : ""}`}>
        {step === "referral" && <ReferralStep onNext={next} />}

        {step === "goals" && (
          <div className="wl-col">
            <h1 className="wl-h1">Welcome to Maal{firstName ? `, ${firstName}` : ""}. Where would you like to start?</h1>
            <p className="wl-sub">Pick what matters most to you right now. You can change this later.</p>
            <div className="wl-options" role="group" aria-label="Your goals">
              {GOALS.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <button key={g.id} type="button" className={`wl-option${on ? " on" : ""}`} aria-pressed={on}
                    onClick={() => setGoals((cur) => (on ? cur.filter((x) => x !== g.id) : [...cur, g.id]))}>
                    <span className="wl-option-icon">{g.icon}</span>{g.label}
                    {on && <Check className="size-4 wl-tick" />}
                  </button>
                );
              })}
            </div>
            <button className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block wl-cta" disabled={!goals.length}
              onClick={async () => { await saveProfile({ goals }); next(); }}>Next</button>
          </div>
        )}

        {step === "connect" && (
          <ConnectStep
            onLinked={(accounts, count) => { setLinked(accounts); setSyncedCount(count); go("linked"); }}
            onSkip={() => go("heard")}
          />
        )}

        {step === "linked" && (
          <div className="wl-col">
            <h1 className="wl-h1">Nice work{firstName ? `, ${firstName}` : ""}. You’ve linked {linked.length || syncedCount} account{(linked.length || syncedCount) === 1 ? "" : "s"}.</h1>
            <p className="wl-sub">Link more accounts for a fuller picture, or start exploring Maal.</p>
            <div className="wl-linked">
              {linked.length ? linked.slice(0, 8).map((a) => (
                <div key={a.id} className="wl-linked-row">
                  <span className="wl-dot" />
                  <div>
                    <p style={{ fontWeight: 600 }}>{a.institution_name || "Account"}</p>
                    {a.institution_type && <p className="wl-muted">{a.institution_type}</p>}
                  </div>
                </div>
              )) : (
                <div className="wl-linked-row"><span className="wl-dot" /><p>{syncedCount} account{syncedCount === 1 ? "" : "s"} synced from your bank</p></div>
              )}
            </div>
            <button className="v2-btn v2-btn-line v2-btn-block wl-cta" onClick={() => go("connect")}>Link another account</button>
            <button className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block" style={{ marginTop: ".6rem" }} onClick={next}>Continue</button>
          </div>
        )}

        {step === "heard" && (
          <div className="wl-col">
            <h1 className="wl-h1">How did you hear about us?</h1>
            <p className="wl-sub">Please select one option below.</p>
            <div className="wl-options" role="radiogroup" aria-label="How did you hear about Maal">
              {HEARD.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={heard === id}
                  className={`wl-option wl-option-plain${heard === id ? " on" : ""}`} onClick={() => setHeard(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block wl-cta" disabled={!heard} onClick={finish}>Next</button>
            <button className="wl-skip-link" onClick={finish}>Skip and go to my dashboard</button>
          </div>
        )}
      </main>

      <footer className={`wl-foot${dark ? " is-dark" : ""}`}>
        <a href="/security" target="_blank" rel="noreferrer">How Maal keeps your data safe</a>
      </footer>
    </div>
  );
}

function ReferralStep({ onNext }: { onNext: () => void }) {
  const [data, setData] = useState<ReferralSummary | null>(null);
  useEffect(() => { getReferrals().then(setData).catch(() => setData(null)); }, []);

  const copy = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.link); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy the link."); }
  };
  const share = async () => {
    if (!data) return;
    const text = "I'm using Maal to get on top of my money. Here's my invite, so you can skip the waitlist:";
    if (navigator.share) { try { await navigator.share({ title: "Join me on Maal", text, url: data.link }); } catch { /* cancelled */ } }
    else await copy();
  };

  return (
    <div className="wl-col">
      <div className="wl-offer">
        <span style={{ fontSize: 13, opacity: .9 }}>Limited time offer</span>
        <p className="wl-offer-h">Refer 3 friends,<br />renew for $4.99.</p>
        <p style={{ opacity: .9, fontSize: 14 }}>Your friends skip the waitlist.<br />You save $45 on next year.</p>
      </div>
      <p className="wl-howto">How it works</p>
      <ol className="wl-timeline">
        <li><b>Share your link</b><span>Send it to friends who aren’t on Maal yet. It lets them skip the waitlist.</span></li>
        <li><b>They join</b><span>They start with a free trial, then the same $4.99 first-year offer.</span></li>
        <li><b>You get rewarded</b><span>When 3 of them become members, your next yearly renewal is $4.99 instead of $49.99.</span></li>
      </ol>
      <button className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block wl-cta" onClick={share} disabled={!data}>
        <Share2 className="size-4" /> Refer your friends
      </button>
      <button className="v2-btn v2-btn-line v2-btn-block" style={{ marginTop: ".6rem" }} onClick={copy} disabled={!data}>
        <Copy className="size-4" /> Copy your link
      </button>
      <button className="wl-skip-link" onClick={onNext}>Maybe later</button>
    </div>
  );
}

function ConnectStep({ onLinked, onSkip }: { onLinked: (a: LinkedAccount[], count: number) => void; onSkip: () => void }) {
  const [live, setLive] = useState<boolean | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/basiq/status", { credentials: "include" })
      .then((r) => r.json()).then((s) => setLive(!!s.live)).catch(() => setLive(false));
  }, []);

  // Basiq's consent screen doesn't send people back, so it opens in a new tab
  // and we sync when they say they're done.
  const connect = () => { window.open("/basiq/connect", "_blank", "noopener"); setOpened(true); setMsg(null); };

  const finished = async () => {
    setBusy(true);
    setMsg("Securely importing your accounts…");
    try {
      const r = await fetch("/api/v1/basiq/sync", { method: "POST", credentials: "include", headers: { "Idempotency-Key": crypto.randomUUID() } });
      const j = await r.json();
      if (!r.ok || !j.import_run_id) throw new Error(j.error || "We couldn't start the import.");
      let count = 0;
      for (let i = 0; i < 90; i++) {
        await new Promise((res) => setTimeout(res, 1000));
        const s = await fetch(`/api/v1/import-runs/${encodeURIComponent(j.import_run_id)}`, { credentials: "include" });
        if (!s.ok) continue;
        const { import_run: run } = await s.json();
        if (run.status === "succeeded") { count = Number(run.summary?.accounts ?? 0); break; }
        if (run.status === "dead") throw new Error(run.last_error || "Your bank didn't respond. Try again in a moment.");
      }
      const la = await fetch("/api/v1/linked_accounts", { credentials: "include" }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      const accounts: LinkedAccount[] = Array.isArray(la) ? la : (la?.data ?? []);
      if (!accounts.length && !count) { setMsg("We didn't find any connected accounts yet. Finish connecting in the other tab, then try again."); return; }
      onLinked(accounts, count);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wl-col" style={{ textAlign: "center" }}>
      <h1 className="wl-h1">Connect your accounts</h1>
      <p className="wl-sub" style={{ color: "rgba(255,255,255,.75)" }}>Add your everyday accounts to see every dollar in and out. Read-only, through Australia’s Consumer Data Right.</p>
      {/* Round bank badges with initials (names on hover / for screen readers) — no bank logos. */}
      <div className="wl-banks" role="list" aria-label="Supported Australian banks include">
        {BANKS.map(([name, short], i) => (
          <span key={name} role="listitem" title={name} aria-label={name} className={`wl-bank${i === 8 ? " wl-bank-hero" : ""}`}>{short}</span>
        ))}
      </div>
      <p className="wl-bank-names">{BANKS.slice(0, 8).map(([n]) => n).join(" · ")} and 100+ more</p>
      {live === false ? (
        <>
          <p className="wl-note">Bank connections are switching on soon. You can add your accounts by hand from the dashboard in the meantime.</p>
          <button className="v2-btn v2-btn-light v2-btn-lg v2-btn-block wl-cta" onClick={onSkip}>Continue</button>
        </>
      ) : !opened ? (
        <button className="v2-btn v2-btn-light v2-btn-lg v2-btn-block wl-cta" onClick={connect} disabled={live === null}>Connect my accounts</button>
      ) : (
        <>
          <p className="wl-note">Finish connecting in the tab that just opened, then come back here.</p>
          <button className="v2-btn v2-btn-light v2-btn-lg v2-btn-block wl-cta" onClick={finished} disabled={busy}>{busy ? "Importing…" : "I’ve finished connecting"}</button>
          <button className="wl-skip-link" style={{ color: "rgba(255,255,255,.75)" }} onClick={connect} disabled={busy}>Open the bank connection again</button>
        </>
      )}
      {msg && <p className="wl-note" role="status">{msg}</p>}
    </div>
  );
}

// Flow-specific layout matched to the reference design in Figma (frames 08–14),
// on top of the v2 tokens in v2-landing.css.
function WelcomeStyles() {
  return (
    <style>{`
      .wl-top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid #D8D8D8; background: #fff; }
      .wl-top.is-dark { background: #000; border-color: transparent; color: #fff; }
      .wl-logo { display: inline-flex; align-items: center; gap: .45rem; font-family: var(--v2-serif); font-size: 22px; color: inherit; }
      .wl-chip { font: inherit; font-size: 15px; padding: .45rem .85rem; border-radius: 10px; border: 1px solid #888; background: transparent; color: #151515; cursor: pointer; }
      .is-dark .wl-chip { color: #fff; }
      .wl-main { min-height: calc(100vh - 130px); display: flex; justify-content: center; padding: 64px 16px 40px; background: #fff; }
      .wl-main.is-dark { color: #fff; background:
        radial-gradient(60% 70% at 108% 92%, rgba(80,150,210,.55) 0%, rgba(40,90,150,.35) 35%, rgba(0,0,0,0) 62%),
        radial-gradient(45% 55% at 96% 100%, rgba(220,235,255,.18), rgba(0,0,0,0) 60%),
        #000; }
      .wl-col { width: 100%; max-width: 380px; }
      .wl-h1 { font-family: var(--v2-serif); font-weight: 400; font-size: clamp(1.8rem, 5vw, 2.15rem); line-height: 1.25; text-align: center; color: #000; }
      .is-dark .wl-h1 { color: #fff; }
      .wl-sub { text-align: center; color: #666; margin-top: .5rem; font-size: 15px; }
      .wl-options { margin-top: 1.4rem; display: grid; gap: .6rem; }
      .wl-option { display: flex; align-items: center; gap: .8rem; width: 100%; text-align: left; padding: 0 1rem; height: 54px; border-radius: 16px;
        border: 1px solid #CACACA; background: #fff; color: #000; font: inherit; font-size: 15px; cursor: pointer; transition: border-color .15s, background .15s; }
      .wl-option:hover { border-color: #8C8C8C; }
      .wl-option.on { background: #F6F6F6; border-color: #8C8C8C; }
      .wl-option:focus-visible { outline: 2px solid var(--v2-accent); outline-offset: 2px; }
      .wl-option-plain { height: 48px; border-radius: 12px; }
      .wl-option-icon { color: #000; display: inline-flex; }
      .wl-tick { margin-left: auto; color: #000; }
      .wl-cta { margin-top: 1.2rem; }
      .wl-col .v2-btn { border-radius: 10px; text-transform: none; font-size: 15px; height: 46px; }
      .v2-btn:disabled { opacity: .35; cursor: not-allowed; }
      .wl-skip-link { display: block; margin: 1rem auto 0; background: none; border: 0; font: inherit; font-size: 13px; color: #111; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
      .wl-offer { border-radius: 14px; padding: 22px 20px; color: #fff; text-align: center;
        background: linear-gradient(140deg, #0A8FA6 0%, #2E9FC0 50%, #9CB8F0 82%, #CDB8FF 100%); }
      .wl-offer-h { font-family: var(--v2-serif); font-weight: 400; font-size: 1.85rem; line-height: 1.2; margin: .4rem 0 .5rem; }
      .wl-howto { margin-top: 1.3rem; font-size: 14px; color: #000; }
      .wl-timeline { list-style: none; padding: 0; margin: .9rem 0 0; display: grid; gap: 1.1rem; position: relative; }
      .wl-timeline::before { content: ""; position: absolute; left: 12px; top: 14px; bottom: 30px; width: 2px; background: #6B6B6B; }
      .wl-timeline li { position: relative; padding-left: 2.6rem; display: grid; gap: .15rem; font-size: 14.5px; color: #000; }
      .wl-timeline li b { font-weight: 400; }
      .wl-timeline li span { color: #666; font-size: 12.5px; line-height: 1.5; }
      .wl-timeline li::before { content: "✓"; position: absolute; left: 0; top: -1px; width: 26px; height: 26px; border-radius: 50%;
        background: #020109; color: #fff; font-size: 13px; display: grid; place-items: center; }
      .wl-banks { margin: 1.6rem auto 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; max-width: 380px; }
      .wl-bank { aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 600; letter-spacing: .02em;
        color: #fff; background: radial-gradient(circle at 35% 30%, #2A3442, #10151C); border: 1px solid rgba(255,255,255,.16);
        box-shadow: 0 0 0 4px rgba(255,255,255,.04); }
      .wl-bank-hero { transform: scale(1.18); background: radial-gradient(circle at 35% 30%, #2E7FD0, #164A86); box-shadow: 0 0 0 5px rgba(80,150,230,.25), 0 0 26px rgba(80,150,230,.55); }
      .wl-bank-names { margin-top: 1rem; font-size: 12.5px; color: rgba(255,255,255,.65); }
      .wl-note { margin-top: 1.2rem; font-size: 14px; color: rgba(255,255,255,.82); }
      .is-dark .v2-btn-light { color: #151515; text-transform: none; }
      .wl-linked { margin-top: 1.4rem; border: 1px solid #E6E6E6; border-radius: 14px; background: #fff; }
      .wl-linked-row { display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; border-bottom: 1px solid #E6E6E6; font-size: 14.5px; color: #000; }
      .wl-linked-row:last-child { border-bottom: 0; }
      .wl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--v2-good); flex-shrink: 0; }
      .wl-muted { color: #666; font-size: 12.5px; }
      .wl-foot { text-align: center; padding: 18px; border-top: 1px solid #EBEBEB; font-size: 13px; background: #fff; }
      .wl-foot a { text-decoration: underline; text-underline-offset: 2px; color: #111; }
      .wl-foot.is-dark { border-color: transparent; background: #000; }
      .wl-foot.is-dark a { color: #fff; }
      @media (max-width: 420px) { .wl-banks { grid-template-columns: repeat(5, 1fr); } }
    `}</style>
  );
}
