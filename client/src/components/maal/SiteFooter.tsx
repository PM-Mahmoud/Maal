import { Link } from "@tanstack/react-router";
import { Disclaimer } from "./Disclaimer";

export function SiteFooter() {
  return (
    <footer>
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="size-2 rounded-full bg-[var(--mint)]" />
              <span className="text-[17px] font-bold tracking-display">Maal</span>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-[34ch] leading-relaxed">
              A CFO-level advisor for every Australian. One score. One plan. No spreadsheets.
            </p>
          </div>
          <FooterCol title="Product" links={[
            { label: "Score Calculator", to: "/score" },
            { label: "Pricing", to: "/pricing" },
            { label: "Waitlist", to: "/waitlist" },
          ]} />
          <FooterCol title="Company" links={[
            { label: "About", to: "/" },
            { label: "Privacy", to: "/" },
            { label: "Terms", to: "/" },
          ]} />
          <FooterCol title="Account" links={[
            { label: "Log in", to: "/auth" },
            { label: "Sign up", to: "/auth" },
          ]} />
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