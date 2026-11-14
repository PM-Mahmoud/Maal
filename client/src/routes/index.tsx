import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { MaalMark } from "../components/maal/MaalMark";
import "../v2-landing.css";
import { useWaitlistGated, signupLink } from "../lib/waitlist";

// Homepage — Maal v2 visual system (specs/onboarding-v2-membership.md, PR 3).
// Prices must match lib/membership.js; test/membership.test.js checks this file.

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maal: Your interest-free ecosystem" },
      { name: "description", content: "Maal brings your accounts, super, debt and net worth into one place, with a Maal Score, a plan and AI chat. Interest-free by default." },
      { property: "og:title", content: "Maal: Your interest-free ecosystem" },
      { property: "og:description", content: "Your accounts, super, debt and net worth in one place, with a Maal Score, a plan and AI chat." },
    ],
  }),
  component: Index,
});

const ASK_PROMPTS = [
  "Am I on track for retirement?",
  "Where is my money going each month?",
  "How fast can I clear my HECS?",
  "What would an interest-free plan look like?",
];

// A quiet field of stars for the dusk hero — drawn here, no image files.
const STARS = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 73) % 100;
  const y = (i * 37) % 62;
  const r = i % 7 === 0 ? 1.4 : i % 3 === 0 ? 1 : 0.7;
  return { x, y, r, o: 0.35 + ((i * 13) % 50) / 100 };
});

function Index() {
  const gated = useWaitlistGated();
  const signup = signupLink(gated);
  const [promptIdx, setPromptIdx] = useState(0);
  const [question, setQuestion] = useState("");
  const [scrolled, setScrolled] = useState(false);

  // The header is fixed; once the page leaves the very top it switches from
  // glass-over-hero to a solid bar (see .v2-header.is-scrolled).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setPromptIdx((i) => (i + 1) % ASK_PROMPTS.length), 3200);
    const els = Array.from(document.querySelectorAll(".v2-reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("is-visible"));
      return () => clearInterval(t);
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => obs.observe(e));
    return () => { clearInterval(t); obs.disconnect(); };
  }, []);

  // The hero chat box is a door into Maal: asking a question starts sign-up
  // (or the waitlist while invite-only). The question is kept for after.
  const ask = (e: FormEvent) => {
    e.preventDefault();
    try { if (question.trim()) sessionStorage.setItem("maal_first_question", question.trim().slice(0, 300)); } catch { /* private mode */ }
    window.location.href = signup.href;
  };

  return (
    <div className="v2">
      {/* Header (fixed; sits on the hero until the page scrolls) */}
      <header className={`v2-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="v2-header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
            <a href="/" className="v2-brand" aria-label="Maal home">
              <MaalMark size={20} />
              <span className="v2-brand-name">Maal</span>
            </a>
            <nav className="v2-nav" aria-label="Main">
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
            </nav>
          </div>
          <div className="v2-header-right">
            <a href="/login" className="v2-login">Log in</a>
            <a href={signup.href} className="v2-btn v2-btn-glass v2-signup">{signup.label}</a>
            <a href="/score" className="v2-btn v2-btn-light v2-btn-cta">Get your free score</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="v2-hero">
        <svg className="v2-stars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r / 6} fill="#fff" opacity={s.o} />)}
        </svg>
        <div className="v2-hero-inner">
          <span className="v2-badge">$4.99 for 1 year — Limited time</span>
          <h1 className="v2-hero-h1">Your <em>interest-free</em> ecosystem</h1>
          <p className="v2-hero-sub">
            <strong>One place for your whole financial life.</strong> See your accounts, super, debt and net worth together,
            get a Maal Score and a plan, and grow your money the profit-based way.
          </p>
          <div className="v2-hero-actions">
            <a href="/score" className="v2-btn v2-btn-light v2-btn-lg">Get your free score →</a>
            <a href={signup.href} className="v2-btn v2-btn-glass v2-btn-lg">{gated ? "Join the waitlist" : "Start your free trial"}</a>
          </div>

          <form className="v2-ask" onSubmit={ask}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={ASK_PROMPTS[promptIdx]}
              aria-label="Ask Maal a question"
              maxLength={300}
            />
            <button type="submit" aria-label="Ask">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </form>
          <p className="v2-ask-note">See everything. Ask anything.</p>
        </div>
      </section>

      {/* Product preview */}
      <div className="v2-preview v2-wrap">
        <div className="v2-preview-card" aria-label="Example Maal dashboard">
          <div className="v2-panel">
            <div className="v2-panel-head">
              <span className="v2-kicker">Net worth</span>
              <span className="v2-up">▲ $3,412 (4.1%)</span>
            </div>
            <div className="v2-big">$86,540</div>
            <svg viewBox="0 0 300 90" style={{ width: "100%", height: 90, marginTop: 10, display: "block" }} aria-hidden>
              <defs>
                <linearGradient id="v2-nw" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,70 C30,66 55,60 80,62 C110,64 130,50 160,46 C190,42 210,36 240,28 C262,22 282,16 300,10 L300,90 L0,90 Z" fill="url(#v2-nw)" />
              <path d="M0,70 C30,66 55,60 80,62 C110,64 130,50 160,46 C190,42 210,36 240,28 C262,22 282,16 300,10" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <div className="v2-ranges">
              {["1W", "1M", "3M", "YTD", "All"].map((r) => <span key={r} className={`v2-range${r === "3M" ? " on" : ""}`}>{r}</span>)}
            </div>
          </div>
          <div className="v2-panel">
            <div className="v2-panel-head">
              <span className="v2-kicker">Maal Score</span>
              <span className="v2-tag">On track</span>
            </div>
            <div className="v2-ring">
              <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
                <circle cx="32" cy="32" r="27" fill="none" stroke="var(--v2-surface-2)" strokeWidth="6" />
                <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray="139 170" transform="rotate(-90 32 32)" />
              </svg>
              <div>
                <div className="v2-big" style={{ fontSize: "2.2rem", marginTop: 0 }}>82<span className="v2-muted" style={{ fontSize: "1rem" }}> / 100</span></div>
              </div>
            </div>
            <div className="v2-pillars">
              {[["Savings buffer", 74], ["Debt health", 68], ["Super & retirement", 78]].map(([label, v]) => (
                <div key={label as string} className="v2-pillar">
                  <span>{label}</span><b>{v}</b>
                  <div className="v2-bar"><span style={{ width: `${v}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="v2-guide">
              <span className="v2-kicker">Your setup</span>
              <p style={{ fontFamily: "var(--v2-serif)", fontSize: "1.35rem", marginTop: 4 }}>Make the most of Maal</p>
              <div className="v2-guide-bar"><span className="on" /><span className="on" /><span /><span /></div>
            </div>
          </div>
        </div>
      </div>

      {/* Everything in one place */}
      <section className="v2-section">
        <div className="v2-wrap v2-reveal">
          <span className="v2-kicker">Everything in one place</span>
          <h2 className="v2-h2">Your money, finally<br />in one clear picture.</h2>
          <p className="v2-lede">Not another budgeting app. Maal turns your accounts, super and debt into one number and a plan to move it, then helps you grow the profit-based way.</p>
          <div className="v2-grid v2-grid-2">
            <a href={signup.href} className="v2-card">
              <span className="v2-kicker">Maal Score</span>
              <h3>Your money in one number.</h3>
              <p>A 0–100 read across five pillars: savings, debt, super, wealth trajectory and protection.</p>
              <div className="v2-card-mock">
                <div className="v2-row"><span>Savings buffer</span><b>74</b></div>
                <div className="v2-row"><span>Debt health</span><b>68</b></div>
                <div className="v2-row"><span>Super &amp; retirement</span><b>78</b></div>
              </div>
            </a>
            <a href={signup.href} className="v2-card">
              <span className="v2-kicker">Ask Maal</span>
              <h3>Ask anything, grounded in your data.</h3>
              <p>AI chat that answers with your real numbers, Australian tax and super rules, and plain English.</p>
              <div className="v2-card-mock">
                <div className="v2-chat-q">Is my super on track for 60?</div>
                <div className="v2-chat-a">On your current path you’re about $46k ahead of the ASFA comfortable benchmark for your age.</div>
              </div>
            </a>
            <a href={signup.href} className="v2-card">
              <span className="v2-kicker">Accounts</span>
              <h3>Every account, one picture.</h3>
              <p>Banks, super, property, crypto, vehicles and debts, connected read-only or added by hand.</p>
              <div className="v2-card-mock">
                <div className="v2-row"><span>Everyday account · bank</span><span className="v2-tag">Synced</span></div>
                <div className="v2-row"><span>Super fund</span><span className="v2-tag">Synced</span></div>
                <div className="v2-row"><span className="v2-muted">Read-only · revoke anytime</span><span /></div>
              </div>
            </a>
            <a href={signup.href} className="v2-card">
              <span className="v2-kicker">Profit-based investing · Coming soon</span>
              <h3>Grow without interest.</h3>
              <p>Explore profit-based investment options from our partners, shown as general information so the decisions stay yours.</p>
              <div className="v2-card-mock">
                <div className="v2-row"><span>Profit-sharing, not interest</span><span className="v2-tag">Coming soon</span></div>
                <div className="v2-row"><span className="v2-muted">General information only, not advice</span><span /></div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="v2-section v2-section-alt" id="how">
        <div className="v2-wrap v2-reveal">
          <span className="v2-kicker">How it works</span>
          <h2 className="v2-h2">From scattered accounts to<br />one honest number.</h2>
          <div className="v2-grid v2-grid-3">
            <div className="v2-card">
              <span className="v2-step-num">01</span>
              <h3>Connect or add what you have</h3>
              <p>Link your bank read-only through open banking, or add income, super, HECS, mortgage and savings by hand in a few minutes.</p>
            </div>
            <div className="v2-card">
              <span className="v2-step-num">02</span>
              <h3>Get your Maal Score</h3>
              <p>A weighted 0–100 read of your financial health, with what’s helping and what’s holding you back.</p>
            </div>
            <div className="v2-card">
              <span className="v2-step-num">03</span>
              <h3>Improve, the interest-free way</h3>
              <p>Ask Maal questions, let Radar watch for changes, and see profit-based ways to grow, so your score keeps climbing.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Maal */}
      <section className="v2-section">
        <div className="v2-wrap v2-reveal">
          <span className="v2-kicker">Why Maal</span>
          <h2 className="v2-h2">Super, HECS and tax,<br />worked into every number.</h2>
          <div className="v2-why">
            <div className="v2-why-item"><h3>Interest-free by default</h3><p>Maal analyses the debts you already have honestly, and points you to profit-based alternatives rather than new interest-bearing products.</p></div>
            <div className="v2-why-item"><h3>Tax and super, kept current</h3><p>Super, HECS-HELP, EOFY and the ATO, with tax and super figures kept up to date for each financial year.</p></div>
            <div className="v2-why-item"><h3>Secure and read-only</h3><p>Bank connections run through Basiq under the Consumer Data Right. Maal can never move your money, never stores your bank password and never sells your data.</p></div>
            <div className="v2-why-item"><h3>Not a credit score</h3><p>A credit score exists for lenders. The Maal Score measures your whole financial wellbeing, and it exists for you.</p></div>
          </div>
          <p className="v2-fine">
            Maal’s score and insights are general and educational only, not personal financial advice. They don’t take into
            account your full financial situation. For advice tailored to you, speak with a licensed financial adviser.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="v2-section v2-section-alt" id="pricing">
        <div className="v2-wrap v2-reveal" style={{ textAlign: "center" }}>
          <span className="v2-kicker">Pricing</span>
          <h2 className="v2-h2">One membership.<br />Try it free for 14 days.</h2>
          <div className="v2-price" style={{ textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="v2-kicker">Maal Membership</span>
              <span className="v2-tag">Limited time</span>
            </div>
            <div className="v2-price-amt"><span className="v2-price-big">$4.99</span><span className="v2-price-per">for your first year</span></div>
            <p className="v2-muted" style={{ marginTop: ".4rem" }}>Then $49.99/year. Starts with a 14-day free trial, no card needed. Cancel anytime.</p>
            <ul className="v2-list">
              <li>Access to AI chat with Ask Maal</li>
              <li>Your Maal Score, plan and net worth in one place</li>
              <li>Open banking, tax &amp; super tools and retirement projections</li>
              <li>Profit-based investment options from our partners (coming soon, general information only)</li>
            </ul>
            <a href={signup.href} className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block">{gated ? "Join the waitlist" : "Start your free trial"}</a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="v2-cta">
        <div className="v2-wrap v2-reveal">
          <h2>Stop guessing.<br /><em style={{ fontStyle: "italic" }}>Start knowing.</em></h2>
          <p>Two minutes to your first Maal Score. No bank login, no card.</p>
          <div className="v2-hero-actions">
            <a href="/score" className="v2-btn v2-btn-light v2-btn-lg">Get your free score →</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="v2-footer">
        <div className="v2-wrap">
          <div className="v2-footer-grid">
            <div>
              <a href="/" className="v2-brand"><MaalMark size={18} /><span className="v2-brand-name">Maal</span></a>
              <p style={{ marginTop: "1rem", maxWidth: 320 }}>Your interest-free ecosystem. One score, one plan, everything in one place.</p>
            </div>
            <div>
              <p className="v2-kicker">Product</p>
              <ul>
                <li><a href="/score">Free Maal Score</a></li>
                <li><a href="/financial-wellbeing-score">Financial wellbeing score</a></li>
                <li><a href="/pricing">Pricing</a></li>
              </ul>
            </div>
            <div>
              <p className="v2-kicker">Company</p>
              <ul>
                <li><a href="/about">About</a></li>
                <li><a href="/security">Security</a></li>
                <li><a href="/contact">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="v2-kicker">Account</p>
              <ul>
                <li><a href="/login">Log in</a></li>
                <li><a href={signup.href}>{signup.label}</a></li>
              </ul>
            </div>
          </div>
          <div className="v2-disclaimer">
            <p>Read-only open banking through the Consumer Data Right (CDR). Interest-free by default. Education, not advice.</p>
            <p>DISCLAIMER: Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.</p>
            <p>Maal Pty Ltd is not an Australian Financial Services Licensee. Information provided is general in nature and does not take into account your individual objectives, financial situation, or needs. Always consider seeking advice from a qualified financial adviser before making investment decisions. Past performance is not a reliable indicator of future performance.</p>
          </div>
          <div className="v2-footer-bottom">
            <span>© {new Date().getFullYear()} Maal Pty Ltd.</span>
            <span>All amounts in AUD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
