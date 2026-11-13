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
const BANKS = [
  "CommBank", "Westpac", "NAB", "ANZ", "Macquarie", "ING", "Bankwest", "St.George",
  "Bendigo Bank", "Suncorp", "BOQ", "ubank", "Up", "HSBC", "Great Southern Bank", "Heritage",
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
    <div className="v2" style={dark ? { background: "var(--v2-night)", color: "#fff" } : undefined}>
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
        <span className="v2-kicker" style={{ color: "rgba(255,255,255,.75)" }}>Limited time offer</span>
        <p className="wl-offer-h">Refer 3 friends,<br />renew for $4.99.</p>
        <p style={{ opacity: .85, fontSize: 14 }}>Your friends skip the waitlist. You save $45 on next year.</p>
      </div>
      <p className="v2-kicker" style={{ marginTop: "1.6rem" }}>How it works</p>
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
      <div className="wl-banks" aria-label="Supported Australian banks include">
        {BANKS.map((b) => <span key={b} className="wl-bank">{b}</span>)}
        <span className="wl-bank wl-bank-more">+100 more</span>
      </div>
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

// Flow-specific layout, on top of the v2 tokens in v2-landing.css.
function WelcomeStyles() {
  return (
    <style>{`
      .wl-top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--v2-hair); background: var(--v2-bg); }
      .wl-top.is-dark { background: var(--v2-night); border-color: rgba(255,255,255,.12); }
      .wl-logo { display: inline-flex; align-items: center; gap: .4rem; font-family: var(--v2-serif); font-size: 22px; }
      .wl-chip { font: inherit; font-size: 13px; padding: .35rem .8rem; border-radius: 8px; border: 1px solid var(--v2-hair-strong); background: transparent; color: inherit; cursor: pointer; }
      .is-dark .wl-chip { border-color: rgba(255,255,255,.3); }
      .wl-main { min-height: calc(100vh - 120px); display: flex; justify-content: center; padding: 48px 16px 32px; }
      .wl-main.is-dark { background:
        radial-gradient(55% 45% at 85% 80%, rgba(18,181,166,.25), rgba(18,181,166,0) 70%),
        radial-gradient(60% 50% at 10% 10%, rgba(120,140,220,.18), rgba(120,140,220,0) 70%),
        var(--v2-night); }
      .wl-col { width: 100%; max-width: 440px; }
      .wl-h1 { font-family: var(--v2-serif); font-size: clamp(2rem, 6vw, 2.6rem); line-height: 1.08; text-align: center; }
      .wl-sub { text-align: center; color: var(--v2-muted); margin-top: .6rem; font-size: 14.5px; }
      .wl-options { margin-top: 1.6rem; display: grid; gap: .55rem; }
      .wl-option { display: flex; align-items: center; gap: .75rem; width: 100%; text-align: left; padding: .9rem 1rem; border-radius: 12px;
        border: 1px solid var(--v2-hair-strong); background: var(--v2-surface); color: var(--v2-ink); font: inherit; font-size: 14.5px; cursor: pointer; transition: border-color .15s, background .15s; }
      .wl-option:hover { border-color: var(--v2-ink); }
      .wl-option.on { background: var(--v2-surface-2); border-color: var(--v2-ink); }
      .wl-option:focus-visible { outline: 2px solid var(--v2-accent); outline-offset: 2px; }
      .wl-option-icon { color: var(--v2-muted); display: inline-flex; }
      .wl-tick { margin-left: auto; color: var(--v2-accent); }
      .wl-cta { margin-top: 1.4rem; }
      .v2-btn:disabled { opacity: .45; cursor: not-allowed; }
      .wl-skip-link { display: block; margin: 1rem auto 0; background: none; border: 0; font: inherit; font-size: 13px; color: var(--v2-muted); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
      .wl-offer { border-radius: 16px; padding: 22px; color: #fff; text-align: center;
        background: linear-gradient(135deg, #0E3B37 0%, #12B5A6 60%, #8FD9CF 100%); }
      .wl-offer-h { font-family: var(--v2-serif); font-size: 2.2rem; line-height: 1.05; margin: .5rem 0 .6rem; }
      .wl-timeline { list-style: none; padding: 0; margin: .9rem 0 0; display: grid; gap: 1rem; counter-reset: s; }
      .wl-timeline li { position: relative; padding-left: 2.2rem; display: grid; gap: .15rem; font-size: 14px; }
      .wl-timeline li span { color: var(--v2-muted); font-size: 13px; }
      .wl-timeline li::before { counter-increment: s; content: counter(s); position: absolute; left: 0; top: 0; width: 1.5rem; height: 1.5rem; border-radius: 50%;
        background: var(--v2-ink); color: var(--v2-bg); font-family: var(--v2-mono); font-size: 11px; display: grid; place-items: center; }
      .wl-banks { margin: 2rem auto 0; display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
      .wl-bank { padding: .5rem .85rem; border-radius: 999px; border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.07); font-size: 13px; }
      .wl-bank-more { color: rgba(255,255,255,.65); }
      .wl-note { margin-top: 1.2rem; font-size: 13.5px; color: rgba(255,255,255,.8); }
      .wl-linked { margin-top: 1.6rem; border: 1px solid var(--v2-hair); border-radius: 12px; background: var(--v2-surface); }
      .wl-linked-row { display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; border-bottom: 1px solid var(--v2-hair); font-size: 14px; }
      .wl-linked-row:last-child { border-bottom: 0; }
      .wl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--v2-accent); flex-shrink: 0; }
      .wl-muted { color: var(--v2-muted); font-size: 12.5px; }
      .wl-foot { text-align: center; padding: 16px; border-top: 1px solid var(--v2-hair); font-size: 12px; }
      .wl-foot a { text-decoration: underline; text-underline-offset: 2px; color: var(--v2-muted); }
      .wl-foot.is-dark { border-color: rgba(255,255,255,.12); background: var(--v2-night); }
      .wl-foot.is-dark a { color: rgba(255,255,255,.65); }
    `}</style>
  );
}
