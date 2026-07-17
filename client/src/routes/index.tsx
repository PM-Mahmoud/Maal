import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, type CSSProperties } from "react";
import "../retro-landing.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maal — Financial clarity for every Australian" },
      { name: "description", content: "Maal reads your assets, debts, super, and income to deliver a 0–100 Financial Wellbeing Score and a plain-English action plan to improve it." },
      { property: "og:title", content: "Maal — Financial clarity for every Australian" },
      { property: "og:description", content: "Maal reads your assets, debts, super, and income to deliver a 0–100 Financial Wellbeing Score and a plain-English action plan to improve it." },
    ],
  }),
  component: Index,
});

const Star = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 100 100" fill="currentColor" aria-hidden>
    <path d="M50 0l9 34 34-9-25 25 25 25-34-9-9 34-9-34-34 9 25-25L7 25l34 9z" />
  </svg>
);

const TickerItems = () => (
  <span>
    Built for Australia <span className="rf-star">✦</span>
    {" "}Super · HECS · ATO native <span className="rf-star">✦</span>
    {" "}Read-only via Basiq <span className="rf-star">✦</span>
    {" "}Education, never advice <span className="rf-star">✦</span>
    {" "}One score. One plan. No spreadsheets. <span className="rf-star">✦</span>
  </span>
);

function Index() {
  useEffect(() => {
    const fill = document.getElementById("rf-fill");
    if (fill) requestAnimationFrame(() => requestAnimationFrame(() => { (fill as HTMLElement).style.width = "82%"; }));
    const els = Array.from(document.querySelectorAll(".rf-reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-visible")); return; }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);

  const badge = (
    <span className="rf-wordmark-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 2v20M2 12h20" /></svg>
    </span>
  );

  return (
    <div className="rf-scope">
      {/* Ticker */}
      <div className="rf-ticker">
        <div className="rf-ticker-track"><TickerItems /><TickerItems /></div>
      </div>

      {/* Header */}
      <header className="rf-header">
        <div className="rf-header-inner">
          <div className="rf-header-left">
            <a href="/" className="rf-wordmark">{badge}<span className="rf-wordmark-text">Maal</span></a>
            <nav className="rf-nav">
              <a href="/score">Score Calculator</a>
              <a href="#how">How it Works</a>
              <a href="/pricing">Pricing</a>
              <a href="/waitlist">Waitlist</a>
            </nav>
          </div>
          <div className="rf-header-right">
            <Link to="/auth" className="rf-login">Log in</Link>
            <a href="/score" className="rf-btn rf-btn-ink">Calculate your score</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="rf-hero">
        <Star className="rf-star-deco one" />
        <Star className="rf-star-deco two" />
        <div className="rf-wrap">
          <div className="rf-hero-grid">
            <div>
              <span className="rf-kicker">✦ Built for Australia</span>
              <h1 className="rf-hero-h1">Your financial life,<br /><span className="rf-underline"><span className="rf-mark">scored.</span></span></h1>
              <p className="rf-hero-sub">
                Maal is the all-in-one for everyday Australians — it reads your statements, bank accounts and
                transactions, then turns them into one clear financial wellbeing score and a plain-English plan to
                improve it. Super, HECS, portfolio, spending: one clear picture.
              </p>
              <div className="rf-hero-actions">
                <a href="/score" className="rf-btn rf-btn-lg">Get your score free</a>
                <Link to="/auth" className="rf-btn rf-btn-lg rf-btn-ghost">Log in →</Link>
              </div>
              <p className="rf-hero-note">Free to start. No card required. Read-only bank connections via Basiq. Education only — never financial advice.</p>
            </div>

            <div className="rf-card">
              <div className="rf-score-top">
                <span className="rf-score-label">Financial wellbeing score</span>
                <span className="rf-chip">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5L9.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  On track
                </span>
              </div>
              <div className="rf-score-num"><span className="rf-score-big">82</span><span className="rf-score-outof">/ 100</span></div>
              <div className="rf-score-bar"><div className="rf-score-fill" id="rf-fill" /></div>
              <div className="rf-score-rows">
                <div className="rf-score-row"><span><span className="rf-dot" style={{ background: "var(--rf-orange)" }} />Credit Score</span><b>742 / 1,200</b></div>
                <div className="rf-score-row"><span><span className="rf-dot" style={{ background: "var(--rf-teal)" }} />Debt Score</span><b>68 / 100</b></div>
                <div className="rf-score-row"><span><span className="rf-dot" style={{ background: "var(--rf-gold)" }} />Super &amp; Retirement</span><b>78%</b></div>
              </div>
              <p className="rf-score-caption">One score across the parts of money Australians actually deal with.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <div className="rf-strip">
        <div className="rf-strip-grid">
          <div className="rf-strip-item"><div className="rf-strip-big">3 scores</div><div className="rf-strip-small">Credit, debt &amp; financial wellbeing</div></div>
          <div className="rf-strip-item"><div className="rf-strip-big">100+</div><div className="rf-strip-small">Institutions via Basiq open banking</div></div>
          <div className="rf-strip-item"><div className="rf-strip-big">Built for AU</div><div className="rf-strip-small">Super, HECS &amp; ATO native</div></div>
          <div className="rf-strip-item"><div className="rf-strip-big">Read-only</div><div className="rf-strip-small">Maal can never move your money</div></div>
        </div>
      </div>

      {/* Products */}
      <section className="rf-section">
        <div className="rf-wrap rf-reveal">
          <span className="rf-eyebrow">Products</span>
          <h2 className="rf-h2">Financial clarity, <span className="rf-mark">out of the box.</span></h2>
          <p className="rf-lede">Not another budgeting app. Maal reads your statements, accounts and transactions — then turns them into education you can act on.</p>
          <div className="rf-products-grid">
            <a href="/score" className="rf-product rf-p-orange">
              <span className="rf-product-eyebrow">Scores</span>
              <h3 className="rf-product-title">Your money in one number.</h3>
              <div className="rf-product-mock">
                <div className="rf-inner" style={{ borderRadius: 16, padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem", width: "100%", maxWidth: 280 }}>
                  <svg viewBox="0 0 90 90" width="66" height="66" style={{ flexShrink: 0 }}>
                    <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
                    <circle cx="45" cy="45" r="38" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeDasharray="172 239" transform="rotate(-90 45 45)" />
                    <text x="45" y="52" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="800" fontFamily="'Bricolage Grotesque',sans-serif">72</text>
                  </svg>
                  <div><p style={{ fontWeight: 700, fontSize: 14 }}>Maal Score</p><p style={{ fontSize: 11, opacity: .8, marginTop: 2 }}>Strong · tracked daily</p></div>
                </div>
              </div>
              <div className="rf-product-foot"><span>Scores</span><span>→</span></div>
            </a>

            <a href="/score" className="rf-product rf-p-teal">
              <span className="rf-product-eyebrow">Ask Maal</span>
              <h3 className="rf-product-title">Ask anything, grounded in your data.</h3>
              <div className="rf-product-mock">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", width: "100%" }}>
                  <div className="rf-inner" style={{ borderRadius: 9999, padding: "0.5rem 1rem", fontSize: 12, width: "fit-content" }}>Is my super on track for 60?</div>
                  <div className="rf-inner" style={{ borderRadius: 14, padding: "0.75rem 1rem", fontSize: 12.5, lineHeight: 1.55, maxWidth: 300 }}>On your trajectory you’re tracking ~$46k ahead of the ASFA comfortable benchmark.</div>
                </div>
              </div>
              <div className="rf-product-foot"><span>Ask Maal</span><span>→</span></div>
            </a>

            <a href="/score" className="rf-product rf-p-rust">
              <span className="rf-product-eyebrow">Radar</span>
              <h3 className="rf-product-title">Catch what’s changing.</h3>
              <div className="rf-product-mock">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", width: "100%" }}>
                  <div className="rf-inner" style={{ borderRadius: 12, padding: "0.625rem 1rem", fontSize: 12.5 }}>📈 NVDA moved +11% today</div>
                  <div className="rf-inner" style={{ borderRadius: 12, padding: "0.625rem 1rem", fontSize: 12 }}>We flagged it — here’s what drove it.</div>
                </div>
              </div>
              <div className="rf-product-foot"><span>Radar</span><span>→</span></div>
            </a>

            <a href="/score" className="rf-product rf-p-gold">
              <span className="rf-product-eyebrow">Portfolio</span>
              <h3 className="rf-product-title">See your wealth move over time.</h3>
              <div className="rf-product-mock">
                <div className="rf-inner" style={{ borderRadius: 16, padding: "1.25rem", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "'Bricolage Grotesque',sans-serif" }}>$39,550</span>
                    <span className="rf-inner" style={{ borderRadius: 9999, padding: "0.25rem 0.625rem", fontSize: 11, fontWeight: 700 }}>▲ +7.5% · 1M</span>
                  </div>
                  <svg viewBox="0 0 200 60" style={{ marginTop: "0.75rem", width: "100%", height: 56, display: "block" }}>
                    <defs><linearGradient id="rf-sp" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgba(34,28,21,0.35)" /><stop offset="100%" stopColor="rgba(34,28,21,0)" /></linearGradient></defs>
                    <path d="M0,50 C30,45 60,40 90,35 C120,30 150,25 200,12" fill="none" stroke="#221C15" strokeWidth="2" />
                    <path d="M0,50 C30,45 60,40 90,35 C120,30 150,25 200,12 L200,60 L0,60 Z" fill="url(#rf-sp)" />
                  </svg>
                </div>
              </div>
              <div className="rf-product-foot"><span>Portfolio</span><span>→</span></div>
            </a>

            <a href="/score" className="rf-product rf-p-cocoa wide">
              <span className="rf-product-eyebrow">Accounts</span>
              <h3 className="rf-product-title">Every account, one clear picture.</h3>
              <div className="rf-product-mock">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", width: "100%", maxWidth: 600 }}>
                  <div className="rf-inner" style={{ borderRadius: 12, padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}><span>CommBank · transactions</span><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--rf-gold)" }} /></div>
                  <div className="rf-inner" style={{ borderRadius: 12, padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}><span>AustralianSuper · super</span><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--rf-gold)" }} /></div>
                  <div className="rf-inner" style={{ borderRadius: 12, padding: "0.75rem 1rem", fontSize: 12, opacity: .8, gridColumn: "span 2" }}>Read-only via Basiq · revoke anytime</div>
                </div>
              </div>
              <div className="rf-product-foot"><span>Accounts</span><span>→</span></div>
            </a>
          </div>
        </div>
      </section>

      {/* How */}
      <section className="rf-section rf-section-alt" id="how">
        <div className="rf-wrap rf-reveal">
          <span className="rf-eyebrow">How it works</span>
          <h2 className="rf-h2">Three steps from spreadsheets to a single, honest number.</h2>
          <div className="rf-how-grid">
            <div className="rf-step"><div className="rf-step-num">01</div><h3 className="rf-step-title">Tell Maal what you have</h3><p className="rf-step-body">Add your income, super balance, HECS, mortgage, savings, and any investments. Takes a few minutes — no bank login needed to start.</p></div>
            <div className="rf-step"><div className="rf-step-num">02</div><h3 className="rf-step-title">Get your Maal Score</h3><p className="rf-step-body">A weighted 0–100 read of your financial health across five pillars: savings buffer, debt health, super adequacy, wealth trajectory, and protection.</p></div>
            <div className="rf-step"><div className="rf-step-num">03</div><h3 className="rf-step-title">Follow your action plan</h3><p className="rf-step-body">A prioritised list of moves to lift your score, ranked by impact. The plan adapts as your situation changes.</p></div>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="rf-section">
        <div className="rf-wrap rf-reveal">
          <span className="rf-eyebrow">Why Maal</span>
          <h2 className="rf-h2">Built for the financial life <span className="rf-mark">Australians</span> actually have.</h2>
          <p className="rf-lede">Super, HECS, franking credits, EOFY, the ATO, property, debt and open banking all shape how Australians build wealth. Maal brings them into one clear picture.</p>
          <div className="rf-why-list">
            <div className="rf-why-item"><div className="rf-why-title">Clarity by design</div><p className="rf-why-body">Net worth, debt, super, spending and investments in one place — explained in plain language so you always know where you stand.</p></div>
            <div className="rf-why-item"><div className="rf-why-title">Australian to the core</div><p className="rf-why-body">Superannuation, HECS-HELP, franking credits, EOFY, the ATO — Maal speaks Australian finance natively, not as a US import.</p></div>
            <div className="rf-why-item"><div className="rf-why-title">Secure and read-only</div><p className="rf-why-body">Bank connections via Basiq under the Consumer Data Right. Maal can never move money. Credentials are never stored. Your data is never sold.</p></div>
            <div className="rf-why-item"><div className="rf-why-title">Education, not instructions</div><p className="rf-why-body">Maal explains what’s happening in your finances and why it matters. The decisions stay yours.</p></div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="rf-section rf-section-alt">
        <div className="rf-wrap rf-reveal">
          <span className="rf-eyebrow">Pricing</span>
          <h2 className="rf-h2">One product. Three honest tiers.</h2>
          <div className="rf-price-grid">
            <div className="rf-price">
              <p className="rf-price-name">Free</p>
              <div className="rf-price-amt"><span className="rf-price-big">$0</span><span className="rf-price-per">forever</span></div>
              <p className="rf-price-desc">Maal Score, basic dashboard, manual entry.</p>
              <Link to="/auth" className="rf-btn rf-btn-ghost rf-btn-block">Start free</Link>
            </div>
            <div className="rf-price featured">
              <span className="rf-price-popular">Most popular</span>
              <p className="rf-price-name">Pro</p>
              <div className="rf-price-amt"><span className="rf-price-big">$20</span><span className="rf-price-per">AUD / month</span></div>
              <p className="rf-price-desc">Open banking sync, tax &amp; super tools, retirement projections, Ask Maal.</p>
              <a href="/pricing" className="rf-btn rf-btn-block">Get Pro</a>
            </div>
            <div className="rf-price">
              <p className="rf-price-name">Max</p>
              <div className="rf-price-amt"><span className="rf-price-big">$200</span><span className="rf-price-per">AUD / month</span></div>
              <p className="rf-price-desc">Multi-entity, Radar alerts, Vault PDF extraction, priority support.</p>
              <a href="/contact" className="rf-btn rf-btn-ghost rf-btn-block">Talk to us</a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rf-cta">
        <div className="rf-wrap rf-reveal">
          <div className="rf-cta-block">
            <Star className="rf-star-deco one" style={{ top: "14%", right: "8%", color: "var(--rf-gold)" }} />
            <h2 className="rf-cta-h2">Stop guessing.<br />Start scoring.</h2>
            <p className="rf-cta-sub">Two minutes to your first Maal Score. No bank login. No credit card.</p>
            <div className="rf-cta-actions">
              <a href="/score" className="rf-btn rf-btn-lg rf-btn-ink">Calculate your score</a>
              <a href="/waitlist" className="rf-btn rf-btn-lg rf-btn-ghost">Join the waitlist</a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="rf-footer">
        <div className="rf-footer-main">
          <div>
            <a href="/" className="rf-wordmark">{badge}<span className="rf-wordmark-text" style={{ color: "var(--rf-cream)" }}>Maal</span></a>
            <p className="rf-footer-desc">The financial wellbeing score for every Australian. One score. One plan. No spreadsheets.</p>
          </div>
          <div className="rf-footer-col">
            <p className="rf-footer-col-title">Product</p>
            <ul>
              <li><a href="/score">Score Calculator</a></li>
              <li><a href="/financial-wellbeing-score">Financial Wellbeing Score</a></li>
              <li><a href="/pricing">Pricing</a></li>
              <li><a href="/waitlist">Waitlist</a></li>
            </ul>
          </div>
          <div className="rf-footer-col">
            <p className="rf-footer-col-title">Company</p>
            <ul>
              <li><a href="/about">About</a></li>
              <li><a href="/security">Security</a></li>
              <li><a href="/contact">Contact</a></li>
            </ul>
          </div>
          <div className="rf-footer-col">
            <p className="rf-footer-col-title">Account</p>
            <ul>
              <li><Link to="/auth">Log in</Link></li>
              <li><a href="/signup">Sign up</a></li>
            </ul>
          </div>
        </div>
        <div className="rf-disclaimer">
          <p>DISCLAIMER: Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.</p>
          <p>Maal Pty Ltd is not an Australian Financial Services Licensee. Information provided is general in nature and does not take into account your individual objectives, financial situation, or needs. Always consider seeking advice from a qualified financial adviser before making investment decisions. Past performance is not a reliable indicator of future performance.</p>
        </div>
        <div className="rf-footer-bottom">
          <div className="rf-footer-bottom-inner">
            <span>© {new Date().getFullYear()} Maal Pty Ltd. Built in Australia.</span>
            <span>All amounts in AUD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
