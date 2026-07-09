import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/api";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { ThemeToggle } from "@/components/maal/ThemeToggle";
import { NotificationBell } from "@/components/maal/app/NotificationBell";
import {
  LayoutDashboard, MessageCircle, FileSearch, Radar as RadarIcon,
  Wallet, FolderLock, ArrowLeftRight, Target, UserCircle2,
  MessageSquarePlus, Map, LifeBuoy, ChevronDown, LogOut,
  X, Upload, Lightbulb,
  PiggyBank, Receipt, Calculator, TrendingDown, Dices, Shield,
  BarChart3, MapPin,
} from "lucide-react";

type Item = { to: string; label: string; icon: any; soon?: boolean };

const TOP: Item[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/advisor", label: "Ask Maal", icon: MessageCircle },
  { to: "/app/research", label: "Research", icon: FileSearch },
  { to: "/app/radar", label: "Radar", icon: RadarIcon },
];

const PORTFOLIO: Item[] = [
  { to: "/app/assets", label: "Assets & Liabilities", icon: Wallet },
  { to: "/app/vault", label: "Vault", icon: FolderLock },
  { to: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/onboarding", label: "Profile", icon: UserCircle2 },
];

const TOOLS: Item[] = [
  { to: "/app/super-optimizer", label: "Super Optimizer", icon: PiggyBank },
  { to: "/app/tax-optimizer", label: "Tax Optimizer", icon: Receipt },
  { to: "/app/tax-bracket-visualizer", label: "Tax Brackets", icon: Calculator },
  { to: "/app/debt-payoff", label: "Debt Payoff", icon: TrendingDown },
  { to: "/app/scenarios-simulator", label: "Scenarios", icon: Dices },
  { to: "/app/insurance-gap", label: "Insurance Gap", icon: Shield },
  { to: "/app/net-worth-flow", label: "Net Worth Flow", icon: BarChart3 },
  { to: "/app/cost-of-living", label: "Cost of Living", icon: MapPin },
];

const BOTTOM: { label: string; href: string; icon: any }[] = [
  { label: "Roadmap", href: "/app/roadmap", icon: Map },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [portfolioOpen, setPortfolioOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  function isActive(to: string) {
    return location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
  }

  function NavLink({ item, indent = false }: { item: Item; indent?: boolean }) {
    const active = isActive(item.to);
    const Icon = item.icon;
    return (
      <Link
        to={item.to}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${indent ? "pl-8" : ""} ${
          active ? "bg-mint/15 text-mint" : "text-muted-foreground hover:bg-[var(--secondary)] hover:text-foreground"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-[var(--surface)] sticky top-0 h-screen">
        <div className="px-5 h-14 flex items-center gap-2 border-b border-border">
          <span className="size-2 rounded-full bg-mint" />
          <Link to="/app" className="text-[16px] font-bold tracking-display">Maal</Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {TOP.map((n) => <NavLink key={n.to} item={n} />)}

          <button
            onClick={() => setPortfolioOpen((v) => !v)}
            className="mt-3 w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            aria-expanded={portfolioOpen}
          >
            My Portfolio
            <ChevronDown className={`size-3 transition-transform ${portfolioOpen ? "" : "-rotate-90"}`} />
          </button>
          {portfolioOpen && PORTFOLIO.map((n) => <NavLink key={n.to} item={n} indent />)}

          <button
            onClick={() => setToolsOpen((v) => !v)}
            className="mt-3 w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            aria-expanded={toolsOpen}
          >
            Calculators
            <ChevronDown className={`size-3 transition-transform ${toolsOpen ? "" : "-rotate-90"}`} />
          </button>
          {toolsOpen && TOOLS.map((n) => <NavLink key={n.to} item={n} indent />)}

          <div className="mt-5 pt-3 border-t border-border space-y-0.5">
            <button
              onClick={() => setFeedbackOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium text-muted-foreground hover:bg-[var(--secondary)] hover:text-foreground"
            >
              <MessageSquarePlus className="size-4 shrink-0" />
              <span className="truncate">Share Feedback</span>
            </button>
            <button
              onClick={() => setSupportOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium text-muted-foreground hover:bg-[var(--secondary)] hover:text-foreground"
            >
              <LifeBuoy className="size-4 shrink-0" />
              <span className="truncate">Support</span>
            </button>
            {BOTTOM.map((b) => {
              const Icon = b.icon;
              return (
                <a key={b.label} href={b.href} target={b.href.startsWith("http") ? "_blank" : undefined}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium text-muted-foreground hover:bg-[var(--secondary)] hover:text-foreground">
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{b.label}</span>
                </a>
              );
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between px-2">
            <p className="text-[11px] text-muted-foreground truncate">{email}</p>
            <ThemeToggle />
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[8px] text-[12px] text-muted-foreground hover:bg-[var(--secondary)] hover:text-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex sticky top-[3px] z-30 h-12 bg-background/90 backdrop-blur border-b border-border items-center justify-end px-6 gap-2">
          <NotificationBell />
        </header>
        <header className="md:hidden sticky top-[3px] z-30 h-14 bg-background/90 backdrop-blur border-b border-border flex items-center justify-between px-4">
          <Link to="/app" className="text-[15px] font-bold tracking-display">Maal</Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <select
              value={location.pathname}
              onChange={(e) => navigate({ to: e.target.value as "/app" })}
              className="text-[12px] bg-transparent border border-border rounded-[6px] px-2 py-1"
            >
              {[...TOP, ...PORTFOLIO, ...TOOLS].map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
            </select>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border px-6 py-4">
          <Disclaimer variant="inline" />
        </footer>
      </div>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("feedback" as any).insert({
        user_id: user?.id ?? null,
        message: feedback,
        has_screenshot: !!file,
      });
    } catch {}
    setSubmitting(false);
    onClose();
  }

  function onFile(f: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return;
    setFile(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[var(--surface)] border border-border rounded-[14px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 className="text-[17px] font-bold tracking-display">Share Your Feedback</h2>
            <p className="text-[12px] text-muted-foreground mt-1">
              We'd love to hear your thoughts on how we can improve Maal
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 pt-5 space-y-4">
          <div>
            <label className="text-[12px] font-semibold">Your Feedback</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              placeholder="Share your thoughts, ideas, or report an issue..."
              className="mt-2 w-full bg-background border border-border rounded-[10px] px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-mint"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold">Screenshot (Optional)</label>
            <label className="mt-2 flex flex-col items-center justify-center gap-1.5 border border-dashed border-border rounded-[10px] py-6 cursor-pointer hover:bg-[var(--secondary)]">
              <div className="size-8 rounded-full bg-[var(--secondary)] flex items-center justify-center">
                <Upload className="size-4 text-muted-foreground" />
              </div>
              <span className="text-[12px] text-muted-foreground">
                {file ? file.name : "Drag & drop or browse"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Upload a screenshot to help us understand the issue better (max 5MB)
            </p>
          </div>

          <div className="rounded-[10px] border border-border p-3 bg-[var(--secondary)]/40">
            <div className="flex items-start gap-2">
              <Lightbulb className="size-4 text-mint mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold">Want to chat directly with our founder?</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Schedule a 30-minute call to share your feedback, suggestions, ask questions, or just say hi!
                </p>
                <a href="#" className="inline-block mt-2 text-[12px] font-medium text-mint hover:underline">
                  Book a call with Shain →
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] text-[13px] font-medium border border-border hover:bg-[var(--secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim() || submitting}
            className="px-4 py-2 rounded-[8px] text-[13px] font-medium bg-foreground text-background disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupportModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("support_reports" as any).insert({
        user_id: user?.id ?? null,
        description,
        has_screenshot: !!file,
      });
    } catch {}
    setSubmitting(false);
    onClose();
  }

  function onFile(f: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return;
    setFile(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[var(--surface)] border border-border rounded-[14px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 className="text-[17px] font-bold tracking-display">Report an Error</h2>
            <p className="text-[12px] text-muted-foreground mt-1">
              Please describe the issue you encountered so we can fix it
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 pt-5 space-y-4">
          <div>
            <label className="text-[12px] font-semibold">Error Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Please describe what went wrong, including any error messages you saw..."
              className="mt-2 w-full bg-background border border-border rounded-[10px] px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-mint"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold">Screenshot (Optional)</label>
            <label className="mt-2 flex flex-col items-center justify-center gap-1.5 border border-dashed border-border rounded-[10px] py-6 cursor-pointer hover:bg-[var(--secondary)]">
              <div className="size-8 rounded-full bg-[var(--secondary)] flex items-center justify-center">
                <Upload className="size-4 text-muted-foreground" />
              </div>
              <span className="text-[12px] text-muted-foreground">
                {file ? file.name : "Drag & drop or browse"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Upload a screenshot to help us understand the issue better (max 5MB)
            </p>
          </div>

          <p className="text-[12px] text-muted-foreground">
            You can also email us directly at{" "}
            <a href="mailto:support@maal.app" className="text-mint hover:underline">support@maal.app</a>{" "}
            with any issues or bugs.
          </p>

          <div className="rounded-[10px] border border-border p-3 bg-[var(--secondary)]/40">
            <div className="flex items-start gap-2">
              <Lightbulb className="size-4 text-mint mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold">Want to chat directly with our founder?</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  For urgent or complex issues, schedule a call with our founder who can help resolve your problem directly.
                </p>
                <a href="#" className="inline-block mt-2 text-[12px] font-medium text-mint hover:underline">
                  Book a call with Shain →
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] text-[13px] font-medium border border-border hover:bg-[var(--secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
            className="px-4 py-2 rounded-[8px] text-[13px] font-medium bg-foreground text-background disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
