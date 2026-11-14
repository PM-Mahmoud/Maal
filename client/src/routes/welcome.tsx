import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Wallet, Gauge, Landmark, Sprout, Sparkles, Ellipsis, Check } from "lucide-react";
import { supabase } from "@/integrations/api";
import { MaalMark } from "@/components/maal/MaalMark";
import { ReferFriendsStep } from "@/components/maal/onboarding/ReferFriendsStep";
import { LinkedAccountsStep, type LinkedAccount } from "@/components/maal/onboarding/LinkedAccountsStep";
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
  { id: "ask", label: "Ask Maal anything", icon: <Sparkles className="size-4" /> },
  { id: "unsure", label: "Not sure yet", icon: <Ellipsis className="size-4" /> },
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
  // Header right-hand action per step (Figma 08–14): Skip, Close after a bank
  // is linked, nothing on the last question.
  const rightAction = step === "heard" ? null : step === "linked" ? "Close" : "Skip";

  return (
    <div className={`v2 wl wl-step-${step}${dark ? " is-dark" : ""}`}>
      <header className="wl-top">
        <button type="button" className="wl-chip" onClick={back} disabled={step === "referral"} style={step === "referral" ? { visibility: "hidden" } : undefined}>Back</button>
        <span className="wl-logo"><MaalMark size={18} /><span>Maal</span></span>
        {rightAction
          ? <button type="button" className="wl-chip" onClick={next}>{rightAction}</button>
          : <span className="wl-chip" aria-hidden="true" style={{ visibility: "hidden" }}>Skip</span>}
      </header>

      <main className="wl-main">
        {step === "referral" && <ReferFriendsStep />}

        {step === "goals" && (
          <div className="wl-col">
            <h1 className="wl-h1">Welcome to Maal{firstName ? `, ${firstName}` : ""}! Where would you like to start?</h1>
            <p className="wl-sub">Choose what matters most to you right now. You can change this later.</p>
            <div className="wl-options" role="group" aria-label="Your goals">
              {GOALS.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <button key={g.id} type="button" className={`wl-option${on ? " on" : ""}`} aria-pressed={on}
                    onClick={() => setGoals((cur) => (on ? cur.filter((x) => x !== g.id) : [...cur, g.id]))}>
                    <span className="wl-option-icon">{g.icon}</span>{g.label}
                    {on && <Check className="size-4 wl-tick" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <button type="button" className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block wl-cta" disabled={!goals.length}
              onClick={async () => { await saveProfile({ goals }); next(); }}>Next</button>
          </div>
        )}

        {/* INTEGRATION: ConnectAccountsFlow — agent A2's redesigned bank-connect
            screens (components/maal/connect/) replace <ConnectStep> below. Keep
            the contract: call onLinked(accounts, syncedCount) after a successful
            Basiq import (goes to the "linked" step) and onSkip() to jump to "heard". */}
        {step === "connect" && (
          <ConnectStep
            onLinked={(accounts, count) => { setLinked(accounts); setSyncedCount(count); go("linked"); }}
            onSkip={() => go("heard")}
          />
        )}

        {step === "linked" && (
          <LinkedAccountsStep
            firstName={firstName}
            accounts={linked}
            syncedCount={syncedCount}
            onLinkAnother={() => go("connect")}
            onContinue={next}
          />
        )}

        {step === "heard" && (
          <div className="wl-col">
            <h1 className="wl-h1">How did you hear about us?</h1>
            <p className="wl-sub">Please choose one option below.</p>
            <div className="wl-options wl-options-tight" role="radiogroup" aria-label="How did you hear about Maal">
              {HEARD.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={heard === id}
                  className={`wl-option wl-option-plain${heard === id ? " on" : ""}`} onClick={() => setHeard(id)}>
                  {label}
                </button>
              ))}
            </div>
            {/* INTEGRATION: SubscribeFlow — agent A3's subscribe/payment screens
                (components/maal/subscribe/) slot in after this question: route
                finish() through <SubscribeFlow onDone={() => navigate({ to: "/app" })} />
                instead of going straight to the dashboard. */}
            <button type="button" className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block wl-cta" disabled={!heard} onClick={finish}>Next</button>
            <button type="button" className="wl-skip-link" onClick={finish}>Skip and go to my dashboard</button>
          </div>
        )}
      </main>

      {step !== "referral" && step !== "linked" && (
        <footer className="wl-foot">
          <a href="/security" target="_blank" rel="noreferrer">Learn how Maal keeps your data safe</a>
        </footer>
      )}
      <p className="wl-disclaimer">Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.</p>
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
