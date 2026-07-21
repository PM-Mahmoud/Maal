import { Link } from "@tanstack/react-router";
import { Disclaimer } from "./Disclaimer";
import { MaalMark } from "./MaalMark";

export function SiteFooter() {
  return (
    <footer>
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MaalMark size={18} />
              <span className="text-[17px] font-bold tracking-display">Maal</span>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-[34ch] leading-relaxed">
              The financial wellbeing score for every Australian. One score. One plan. No spreadsheets.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Product</p>
            {/* plain anchors: these pages are server-rendered EJS, not client routes */}
            <ul className="space-y-2.5 text-[13px]">
              <li><a href="/score" className="text-foreground/80 hover:text-foreground">Score Calculator</a></li>
              <li><a href="/financial-wellbeing-score" className="text-foreground/80 hover:text-foreground">Financial Wellbeing Score</a></li>
              <li><a href="/pricing" className="text-foreground/80 hover:text-foreground">Pricing</a></li>
            </ul>
          </div>
          <FooterCol title="Company" links={[
            { label: "About", to: "/" },
            { label: "Privacy", to: "/" },
            { label: "Terms", to: "/" },
          ]} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Account</p>
            {/* plain anchors: login/signup are server-rendered EJS, not client routes */}
            <ul className="space-y-2.5 text-[13px]">
              <li><a href="/login" className="text-foreground/80 hover:text-foreground">Log in</a></li>
              <li><a href="/signup" className="text-foreground/80 hover:text-foreground">Sign up</a></li>
            </ul>
          </div>
        </div>
      </div>
      <Disclaimer />
      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} Maal Pty Ltd. Built in Australia.</span>
          <span className="tracking-wider uppercase">All amounts in AUD</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">{title}</p>
      <ul className="space-y-2.5 text-[13px]">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="text-foreground/80 hover:text-foreground">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}