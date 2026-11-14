import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { supabase, handleUnauthenticated } from "@/integrations/api";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { MaalMark } from "@/components/maal/MaalMark";
import { ThemeToggle } from "@/components/maal/ThemeToggle";
import { NotificationBell } from "@/components/maal/app/NotificationBell";
import { initPrivacy } from "@/components/maal/home/prefs";
import "@/components/maal/home/home.css";
import {
  MessageCircle, FileSearch, Radar as RadarIcon,
  Wallet, FolderLock, ArrowLeftRight, Target, UserCircle2, Landmark, Home, Building2,
  MessageSquarePlus, Map, LifeBuoy, ChevronDown, LogOut,
  X, Lightbulb, CreditCard, Menu, Sparkles,
  PiggyBank, Receipt, Calculator, TrendingDown, Dices,
  BarChart3, BriefcaseBusiness,
  HandCoins, ShieldCheck, Store,
} from "lucide-react";
import { ClipboardList, ListChecks } from "lucide-react";

// Single source for the two contact details users see in-app. The old
// support@maal.app address had no MX record, so every mail sent to it bounced.
export const SUPPORT_EMAIL = "hello@hellomaal.com";
export const FOUNDER_CALENDAR_URL = "https://calendar.app.google/oh9aghBVTuQ4fvCH7";

/** Any page can open the shell's support dialog: window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT)). */
export const OPEN_SUPPORT_EVENT = "maal:open-support";

type Item = { to: string; label: string; icon: any; soon?: boolean };

const TOP: Item[] = [
  { to: "/app", label: "Home", icon: Home },
  { to: "/app/advisor", label: "Ask Maal", icon: MessageCircle },
  { to: "/app/research", label: "Research", icon: FileSearch },
  { to: "/app/radar", label: "Radar", icon: RadarIcon },
];

const PORTFOLIO: Item[] = [
  { to: "/app/assets", label: "Net worth", icon: Wallet },
  { to: "/app/wealth/cash", label: "Cash", icon: Landmark },
  { to: "/app/wealth/investments", label: "Investments", icon: BarChart3 },
  { to: "/app/wealth/property", label: "Property", icon: Building2 },
  { to: "/app/wealth/super", label: "Super", icon: PiggyBank },
  { to: "/app/wealth/liabilities", label: "Liabilities", icon: TrendingDown },
  { to: "/app/wealth/other", label: "Other Assets", icon: BriefcaseBusiness },
  { to: "/app/vault", label: "Vault", icon: FolderLock },
  { to: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/planning", label: "Financial Plan", icon: ClipboardList },
  { to: "/app/action-plan", label: "Action Plan", icon: ListChecks },
  { to: "/app/onboarding", label: "Profile", icon: UserCircle2 },
];

const TOOLS: Item[] = [
  { to: "/app/zakat", label: "Zakat", icon: HandCoins },
  { to: "/app/purification", label: "Purification", icon: ShieldCheck },
  { to: "/app/marketplace", label: "Partner Services", icon: Store },
  { to: "/app/super-optimizer", label: "Super Optimiser", icon: PiggyBank },
  { to: "/app/tax-optimizer", label: "Tax Optimiser", icon: Receipt },
  { to: "/app/tax-bracket-visualizer", label: "Tax Brackets", icon: Calculator },
  { to: "/app/debt-payoff", label: "Debt Payoff", icon: TrendingDown },
  { to: "/app/scenarios-simulator", label: "Scenarios", icon: Dices },
];

const BOTTOM: Item[] = [
  { label: "Plan & Usage", to: "/app/billing", icon: CreditCard },
  { label: "Roadmap", to: "/app/roadmap", icon: Map },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [portfolioOpen, setPortfolioOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Home renders its own header (greeting + actions + notifications).
  const isHome = location.pathname === "/app" || location.pathname === "/app/";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    initPrivacy();
    const openSupport = () => setSupportOpen(true);
    window.addEventListener(OPEN_SUPPORT_EVENT, openSupport);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, openSupport);
  }, []);

  function isActive(to: string) {
    return location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
  }

  function NavLink({ item, onClick }: { item: Item; onClick?: () => void }) {
    const Icon = item.icon;
    return (
      <Link to={item.to} onClick={onClick} className="mh-nav" data-active={isActive(item.to)}
        aria-current={isActive(item.to) ? "page" : undefined}>
        <Icon aria-hidden />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  function Section({ label, open, onToggle, items }: { label: string; open?: boolean; onToggle?: () => void; items: Item[] }) {
    return (
      <>
        <p className="mh-side-label">
          {onToggle ? (
            <button onClick={onToggle} aria-expanded={open}>
              {label}
              <ChevronDown className={`size-3 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          ) : label}
        </p>
        {(open ?? true) && <div className="space-y-0.5">{items.map((n) => <NavLink key={n.to} item={n} />)}</div>}
      </>
    );
  }

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/" }); }

  return (
    <div className="mh-shell min-h-screen flex">
      <aside className="mh-side hidden md:flex w-[250px] lg:w-[272px] shrink-0 flex-col sticky top-0 h-screen">
        <Link to="/app" className="flex items-center gap-2.5 px-6 pt-7 pb-4 text-[var(--mh-ink)] no-underline">
          <MaalMark size={24} />
          <span className="mh-brand">Maal</span>
        </Link>

        <nav aria-label="Main navigation" className="flex-1 px-2.5 pb-4 overflow-y-auto">
          <Section label="Track" items={TOP} />
          <Section label="My wealth" items={PORTFOLIO} open={portfolioOpen} onToggle={() => setPortfolioOpen((v) => !v)} />
          <Section label="Calculators" items={TOOLS} open={toolsOpen} onToggle={() => setToolsOpen((v) => !v)} />
          <p className="mh-side-label">Account</p>
          <div className="space-y-0.5">
            {BOTTOM.map((b) => <NavLink key={b.to} item={b} />)}
            <button onClick={() => setFeedbackOpen(true)} className="mh-nav w-full bg-transparent border-0 cursor-pointer text-left">
              <MessageSquarePlus aria-hidden /> <span className="truncate">Share feedback</span>
            </button>
            <button onClick={() => setSupportOpen(true)} className="mh-nav w-full bg-transparent border-0 cursor-pointer text-left">
              <LifeBuoy aria-hidden /> <span className="truncate">Support</span>
            </button>
          </div>
        </nav>

        <div className="px-5 pb-5 pt-3 space-y-3">
          <Link to="/app/advisor" className="mh-ask"><Sparkles className="size-4" aria-hidden /> Ask anything</Link>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--mh-muted)] truncate">{email}</p>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <button onClick={signOut} aria-label="Sign out" title="Sign out"
                className="grid size-7 place-items-center rounded-full text-[var(--mh-muted)] hover:text-[var(--mh-ink)] hover:bg-[var(--mh-chip)]">
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {!isHome && (
          <header className="mh-topbar hidden md:flex sticky top-0 z-30 h-12 items-center justify-end px-6 gap-2">
            <NotificationBell />
          </header>
        )}
        <header className="mh-topbar md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4">
          <Link to="/app" className="flex items-center gap-2 text-[var(--mh-ink)] no-underline">
            <MaalMark size={18} /><span className="mh-brand" style={{ fontSize: 22 }}>Maal</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"
              className="grid size-9 place-items-center rounded-[8px] border border-[var(--mh-line)] bg-[var(--mh-card)]">
              <Menu className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--mh-line)] px-6 py-4">
          <Disclaimer variant="inline" />
        </footer>
      </div>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
      <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
          <DialogPrimitive.Content className="mh-shell fixed inset-y-0 right-0 z-50 w-[min(88vw,360px)] overflow-y-auto border-l border-[var(--mh-line)] p-4 shadow-xl md:hidden">
            <div className="mb-2 flex items-center justify-between">
              <DialogPrimitive.Title className="flex items-center gap-2">
                <MaalMark size={18} /> <span className="mh-brand" style={{ fontSize: 22 }}>Maal</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close aria-label="Close navigation" className="grid size-8 place-items-center text-[var(--mh-muted)]">
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="sr-only">Navigate to any Maal dashboard feature or account action.</DialogPrimitive.Description>
            <nav aria-label="Mobile dashboard navigation">
              {[
                { label: "Track", items: TOP },
                { label: "My wealth", items: PORTFOLIO },
                { label: "Calculators", items: TOOLS },
                { label: "Account", items: BOTTOM },
              ].map((group) => (
                <section key={group.label}>
                  <h2 className="mh-side-label font-normal">{group.label}</h2>
                  <div className="space-y-0.5">
                    {group.items.map((item) => <NavLink key={item.to} item={item} onClick={() => setMobileNavOpen(false)} />)}
                  </div>
                </section>
              ))}
              <section className="mt-4 border-t border-[var(--mh-line)] pt-3 space-y-0.5">
                <button onClick={() => { setMobileNavOpen(false); setFeedbackOpen(true); }} className="mh-nav w-full bg-transparent border-0 text-left">
                  <MessageSquarePlus aria-hidden /> Share feedback
                </button>
                <button onClick={() => { setMobileNavOpen(false); setSupportOpen(true); }} className="mh-nav w-full bg-transparent border-0 text-left">
                  <LifeBuoy aria-hidden /> Support
                </button>
                <Link to="/app/advisor" onClick={() => setMobileNavOpen(false)} className="mh-ask mt-3"><Sparkles className="size-4" aria-hidden /> Ask anything</Link>
                <div className="mt-2 flex items-center justify-between px-1 py-2">
                  <span className="truncate text-[11px] text-[var(--mh-muted)]">{email}</span>
                  <ThemeToggle />
                </div>
                <button onClick={signOut} className="mh-nav w-full bg-transparent border-0 text-left">
                  <LogOut aria-hidden /> Sign out
                </button>
              </section>
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

// Submissions go to the real POST /feedback endpoint (routes/feedback.js →
// feedback table). The generic /api/v1/:table route stubs unknown tables with
// a fake `{ ok: true }`, and there is no screenshot-attachment support anywhere
// in the backend — so the old supabase.from("feedback"|"support_reports")
// inserts silently discarded submissions and the upload control was fake.
async function postFeedback(message: string, page: string) {
  const r = await fetch("/feedback", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, page }),
  });
  if (r.status === 401) {
    handleUnauthenticated();
    throw new Error("Your session has expired — please sign in again.");
  }
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error || "Could not send. Please try again.");
  }
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit() {
    const message = feedback.trim();
    if (!message) return;
    setSubmitting(true);
    setError(null);
    try {
      await postFeedback(message, window.location.pathname);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send. Please try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); textareaRef.current?.focus(); }}
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-md max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] bg-[var(--surface)] border border-border rounded-[14px] shadow-xl"
        >
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <DialogPrimitive.Title asChild>
                <h2 className="text-[17px] font-bold tracking-display">Share Your Feedback</h2>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <p className="text-[12px] text-muted-foreground mt-1">
                  We'd love to hear your thoughts on how we can improve Maal
                </p>
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close feedback dialog"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-5 pt-5 space-y-4">
            <div>
              <label htmlFor="feedback-message" className="text-[12px] font-semibold">Your Feedback</label>
              <textarea
                id="feedback-message"
                ref={textareaRef}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={5}
                placeholder="Share your thoughts, ideas, or report an issue..."
                className="mt-2 w-full bg-background border border-border rounded-[10px] px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-mint"
              />
            </div>

            {error && (
              <p role="alert" className="text-[12px] font-medium text-red-500">{error}</p>
            )}

            <div className="rounded-[10px] border border-border p-3 bg-[var(--secondary)]/40">
              <div className="flex items-start gap-2">
                <Lightbulb className="size-4 text-mint mt-0.5 shrink-0" />
                <div>
                  <p className="text-[12px] font-semibold">Want to chat directly with our founder?</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Schedule a 30-minute call to share your feedback, suggestions, ask questions, or just say hi!
                  </p>
                  <a href={FOUNDER_CALENDAR_URL} target="_blank" rel="noreferrer noopener"
                    className="inline-block mt-2 text-[12px] font-medium text-mint hover:underline">
                    Book a call with Mahmoud →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-border">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-[8px] text-[13px] font-medium border border-border hover:bg-[var(--secondary)]"
              >
                Cancel
              </button>
            </DialogPrimitive.Close>
            <button
              onClick={handleSubmit}
              disabled={!feedback.trim() || submitting}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium bg-foreground text-background disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SupportModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit() {
    const message = description.trim();
    if (!message) return;
    setSubmitting(true);
    setError(null);
    try {
      // No support_reports table/route exists — persist through the real
      // feedback endpoint, tagged as a support report via the page field.
      await postFeedback(message, `support:${window.location.pathname}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send. Please try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); textareaRef.current?.focus(); }}
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-md max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] bg-[var(--surface)] border border-border rounded-[14px] shadow-xl"
        >
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <DialogPrimitive.Title asChild>
                <h2 className="text-[17px] font-bold tracking-display">Report an Error</h2>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Please describe the issue you encountered so we can fix it
                </p>
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close support dialog"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-5 pt-5 space-y-4">
            <div>
              <label htmlFor="support-description" className="text-[12px] font-semibold">Error Description</label>
              <textarea
                id="support-description"
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Please describe what went wrong, including any error messages you saw..."
                className="mt-2 w-full bg-background border border-border rounded-[10px] px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-mint"
              />
            </div>

            {error && (
              <p role="alert" className="text-[12px] font-medium text-red-500">{error}</p>
            )}

            <p className="text-[12px] text-muted-foreground">
              You can also email us directly at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-mint hover:underline">{SUPPORT_EMAIL}</a>{" "}
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
                  <a href={FOUNDER_CALENDAR_URL} target="_blank" rel="noreferrer noopener"
                    className="inline-block mt-2 text-[12px] font-medium text-mint hover:underline">
                    Book a call with Mahmoud →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-border">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-[8px] text-[13px] font-medium border border-border hover:bg-[var(--secondary)]"
              >
                Cancel
              </button>
            </DialogPrimitive.Close>
            <button
              onClick={handleSubmit}
              disabled={!description.trim() || submitting}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium bg-foreground text-background disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
