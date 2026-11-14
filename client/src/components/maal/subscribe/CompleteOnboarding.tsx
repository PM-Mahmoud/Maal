import { useEffect, useState, type MouseEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { getUsage } from "@/lib/usage.functions";
import { listGoals } from "@/lib/goals.functions";
import { getReferrals } from "@/lib/referrals.functions";
import "./subscribe.css";

// Figma "Complete onboarding" (Maal onboarding → Maal dashboard): after the
// /welcome flow the user lands on the dashboard, where a green "Make the most
// of Maal" card shows setup progress and a dialog lists the remaining tasks
// (link accounts, set a goal, ask Maal a question, invite friends — spec
// step 9). Tasks are read from existing endpoints; nothing new on the server.
//
// Usage (dashboard right column):  <CompleteOnboardingCard autoOpen />
//   autoOpen pops the dialog once per browser, the first time the dashboard
//   loads after onboarding. The card hides itself when every task is done or
//   the user dismisses it.

export type OnboardingTask = {
  id: "accounts" | "goal" | "ask" | "invite";
  label: string;
  blurb: string;
  cta: string;
  href: string;
  done: boolean;
};

const CARD_DISMISS_KEY = "maal_onboarding_card_dismissed";
const DIALOG_SEEN_KEY = "maal_onboarding_dialog_seen";

async function loadTasks(): Promise<OnboardingTask[]> {
  const [accounts, wealth, goals, usage, refs] = await Promise.all([
    fetch("/api/v1/linked_accounts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []) as Promise<unknown[]>,
    // Balances added by hand count too ("or add balances yourself").
    fetch("/api/v1/wealth-summary", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ assetTotal?: number; liabilityTotal?: number } | null>,
    listGoals().catch(() => [] as unknown[]),
    getUsage().catch(() => null),
    getReferrals().catch(() => null),
  ]);
  return [
    {
      id: "accounts", label: "Link your accounts", cta: "Link accounts", href: "/app/assets",
      blurb: "Connect your Australian bank accounts read-only through open banking, or add balances yourself.",
      done: (Array.isArray(accounts) && accounts.length > 0)
        || Number(wealth?.assetTotal || 0) > 0 || Number(wealth?.liabilityTotal || 0) > 0,
    },
    {
      id: "goal", label: "Set a money goal", cta: "Get started", href: "/app/goals",
      blurb: "Pick something to work towards, like a house deposit or an emergency fund, and track your progress.",
      done: Array.isArray(goals) && goals.length > 0,
    },
    {
      id: "ask", label: "Ask Maal a question", cta: "Ask Maal", href: "/app/advisor",
      blurb: "Ask anything about your money, from your budget to your super, and get answers based on your own numbers.",
      done: (usage?.features?.advisor_messages?.used ?? 0) > 0,
    },
    {
      id: "invite", label: "Invite friends", cta: "Share your link", href: "/app/billing",
      blurb: "When 3 friends become members, your next yearly renewal drops to the first-year price.",
      done: (refs?.signedUp ?? 0) > 0,
    },
  ];
}

export function useOnboardingTasks() {
  const [tasks, setTasks] = useState<OnboardingTask[] | null>(null);
  useEffect(() => { let live = true; void loadTasks().then((t) => { if (live) setTasks(t); }); return () => { live = false; }; }, []);
  const done = tasks ? tasks.filter((t) => t.done).length : 0;
  const total = tasks?.length ?? 0;
  return { tasks, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function Segments({ done, total }: { done: number; total: number }) {
  return (
    <div className="ms-segs" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <span key={i} className={`ms-seg ${i < done ? "on" : ""}`} />)}
    </div>
  );
}

export function CompleteOnboardingCard({ autoOpen, onDismiss }: { autoOpen?: boolean; onDismiss?: () => void }) {
  const { tasks, done, total, pct } = useOnboardingTasks();
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(CARD_DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);

  useEffect(() => {
    if (!autoOpen || !tasks || done === total) return;
    try {
      if (localStorage.getItem(DIALOG_SEEN_KEY) === "1") return;
      localStorage.setItem(DIALOG_SEEN_KEY, "1");
    } catch { /* storage blocked: still show it once this session */ }
    setOpen(true);
  }, [autoOpen, tasks, done, total]);

  if (dismissed || !tasks || done === total) return null;

  function dismiss(e: MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
    try { localStorage.setItem(CARD_DISMISS_KEY, "1"); } catch { /* ignore */ }
    onDismiss?.();
  }

  return (
    <div className="msub">
      <div className="ms-onb-card" role="button" tabIndex={0} onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        aria-label={`Complete onboarding, ${pct}% complete`}>
        <p className="ms-mono">Complete onboarding</p>
        <button type="button" className="ms-icon-btn" onClick={dismiss} aria-label="Hide onboarding card">
          <X className="size-5" strokeWidth={1.6} />
        </button>
        <h3>Make the most of Maal</h3>
        <Segments done={done} total={total} />
        <p className="ms-onb-pct">{pct}% complete</p>
      </div>
      {open && <CompleteOnboardingDialog tasks={tasks} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function CompleteOnboardingDialog({ tasks, onClose }: { tasks: OnboardingTask[]; onClose: () => void }) {
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const [expanded, setExpanded] = useState<string | null>(() => tasks.find((t) => !t.done)?.id ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="msub ms-dialog-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-dialog" role="dialog" aria-modal="true" aria-labelledby="ms-onb-title">
        <div className="ms-dialog-head" style={{ position: "relative" }}>
          <span className="ms-mono">Onboarding</span>
          <button type="button" className="ms-icon-btn" onClick={onClose} aria-label="Close" style={{ top: 26 }}>
            <X className="size-5" strokeWidth={1.6} />
          </button>
        </div>
        <div className="ms-dialog-body">
          <h2 id="ms-onb-title">Complete your onboarding</h2>
          <p className="ms-dialog-lede">Finishing your Maal setup gives you the clearest view of your whole financial picture.</p>
          <div style={{ marginTop: 10 }}><Segments done={done} total={tasks.length} /></div>
          <p className="ms-onb-pct">{pct}% complete</p>

          <ul className="ms-tasks">
            {tasks.map((t) => {
              const isOpen = !t.done && expanded === t.id;
              return (
                <li key={t.id} className={`ms-task ${t.done ? "done" : ""} ${isOpen ? "open" : ""}`}>
                  <button type="button" className="ms-task-row" disabled={t.done} aria-expanded={t.done ? undefined : isOpen}
                    onClick={() => setExpanded(isOpen ? null : t.id)}>
                    <span className="ms-task-status">{t.done && <Check className="size-2.5" strokeWidth={3.5} />}</span>
                    <span className="ms-task-label">{t.label}</span>
                    {t.done ? <span className="ms-done-badge">Completed</span> : <ChevronDown className="ms-task-chev size-[18px]" strokeWidth={1.6} />}
                  </button>
                  {isOpen && (
                    <div className="ms-task-panel">
                      <p>{t.blurb}</p>
                      <a className="ms-task-go" href={t.href}>{t.cta}</a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
