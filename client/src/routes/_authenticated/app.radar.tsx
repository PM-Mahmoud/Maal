import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Pencil, Play, Trash2, Download, BellRing, CheckCircle2, ArrowRight } from "lucide-react";
import { listAlerts, createAlert, deleteAlert, toggleAlert, evaluateAlerts } from "@/lib/alerts.functions";
import { listTemplates } from "@/lib/radar-templates.functions";
import { getRadarReadiness } from "@/lib/radar-readiness.functions";
import { exportEventPdf, exportAllEventsPdf } from "@/lib/radar-pdf";
import { enablePush, disablePush, getPushStatus, pushSupported } from "@/lib/push-client";
import { getNotificationPrefs, setNotificationPref } from "@/lib/notification-prefs.functions";

export const Route = createFileRoute("/_authenticated/app/radar")({ component: RadarPage });

const FREQS = ["daily", "weekly", "monthly"] as const;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function RadarPage() {
  const list = listAlerts;
  const create = createAlert;
  const rm = deleteAlert;
  const toggle = toggleAlert;
  const evaluate = evaluateAlerts;
  const listT = listTemplates;
  const readinessFn = getRadarReadiness;

  const [alerts, setAlerts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<{ score: number; missing: any[]; ready: boolean } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>(undefined);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [frequency, setFrequency] = useState<typeof FREQS[number]>("daily");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [evalBusy, setEvalBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [pushStatus, setPushStatus] = useState<"unsupported" | "denied" | "granted" | "default">("default");
  const [dailyDigest, setDailyDigest] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function refresh() {
    const [r, t, ready]: any = await Promise.all([list(), listT(), readinessFn()]);
    // Guard: r may be [] (stub) or { alerts, events }
    setAlerts(Array.isArray(r?.alerts) ? r.alerts : Array.isArray(r) ? [] : []);
    setEvents(Array.isArray(r?.events) ? r.events : Array.isArray(r) ? [] : []);
    setTemplates(Array.isArray(t?.templates) ? t.templates : Array.isArray(t) ? [] : []);
    setReadiness(ready && typeof ready === 'object' && !Array.isArray(ready) ? ready : null);
  }
  useEffect(() => {
    refresh();
    getPushStatus().then(setPushStatus);
    getNotificationPrefs().then((p) => setDailyDigest(p.daily_digest));
  }, []);

  async function toggleDigest() {
    const next = !dailyDigest;
    setDailyDigest(next);
    const ok = await setNotificationPref("daily_digest", next);
    if (!ok) { setDailyDigest(!next); setToast("Couldn't update the digest setting."); }
    else setToast(next ? "Daily email digest on — a snapshot lands in your inbox each morning." : "Daily email digest off.");
    setTimeout(() => setToast(null), 3500);
  }

  function pickTemplate(t: any) {
    setPrompt(t.prompt);
    setTemplateId(t.id);
    setTemplateSlug(t.slug);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(t.prompt.length, t.prompt.length);
      taRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function togglePush() {
    try {
      if (pushStatus === "granted") {
        await disablePush();
        setPushStatus("default");
        setToast("Browser notifications turned off.");
      } else {
        await enablePush();
        setPushStatus("granted");
        setToast("Browser notifications enabled — you'll get a ping the moment a radar fires.");
      }
    } catch (e: any) {
      setToast(e?.message ?? "Couldn't enable notifications.");
    }
    setTimeout(() => setToast(null), 3500);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      await create({ data: { prompt: prompt.trim(), template: (templateSlug as any), frequency, notify_email: notifyEmail, notify_sms: notifySms, time_aest: time } } as any);
      setPrompt(""); setTemplateId(undefined); setTemplateSlug(undefined);
      setToast("Radar created. We'll email you when something changes.");
      setTimeout(() => setToast(null), 3500);
      refresh();
    } catch (e: any) {
      setToast(e?.message ?? "Couldn't create radar.");
      setTimeout(() => setToast(null), 5000);
    } finally { setBusy(false); }
  }

  async function evalOne(id?: string) {
    setEvalBusy(id ?? "all");
    try {
      const r: any = await evaluate({ data: id ? { alertId: id } : {} } as any);
      setToast(r.fired ? `${r.fired} radar${r.fired > 1 ? "s" : ""} triggered — update sent.` : "No conditions met right now.");
      setTimeout(() => setToast(null), 3500);
      refresh();
    } finally { setEvalBusy(null); }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[32px] md:text-[36px] tracking-display font-bold leading-tight">Radar</h1>
            <p className="mt-2 text-[14px] text-muted-foreground max-w-2xl">
              Tell Maal what to watch. It checks on your schedule, alerts you in-app, on your phone and by email the moment something material changes.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={toggleDigest}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                dailyDigest
                  ? "border-[var(--mint)]/40 bg-[var(--mint)]/10 text-[var(--mint)]"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              {dailyDigest ? "Daily digest on" : "Daily email digest"}
            </button>
            {pushSupported() && (
              <button
                onClick={togglePush}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  pushStatus === "granted"
                    ? "border-[var(--mint)]/40 bg-[var(--mint)]/10 text-[var(--mint)]"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                <BellRing className="w-3.5 h-3.5" />
                {pushStatus === "granted" ? "Push on" : pushStatus === "denied" ? "Push blocked" : "Enable browser push"}
              </button>
            )}
          </div>
        </div>
      </header>

      {toast && (
        <div className="mb-4 px-4 py-2 rounded-[8px] border border-mint/30 bg-mint/10 text-[12px] text-foreground">
          {toast}
        </div>
      )}

      {/* Top row: composer (left, 2/3) + history (right) */}
      <div className="grid lg:grid-cols-3 gap-4 mb-10">
        <form
          onSubmit={submit}
          className="lg:col-span-2 relative p-5 md:p-6 border border-border rounded-[14px] bg-[var(--surface)] focus-within:border-foreground/40 transition-colors"
        >
          {templateId && (
            <div className="mb-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--mint)]/15 text-[var(--mint)] text-[10px] font-semibold uppercase tracking-[0.12em]">
              <Pencil className="w-3 h-3" /> Editing template — tweak the prompt below
            </div>
          )}
          <textarea
            ref={taRef}
            data-radar-prompt
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); }}
            rows={4}
            disabled={busy}
            placeholder='e.g. "If BHP moves more than 10% in a week, tell me what caused it."'
            className="w-full bg-transparent text-[14px] leading-relaxed placeholder:text-muted-foreground/60 resize-none focus:outline-none disabled:opacity-60"
            aria-label="Describe what Radar should watch"
          />

          {/* Inline controls */}
          <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} className="accent-[var(--mint)]" />
                  Email
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} className="accent-[var(--mint)]" />
                  SMS
                </label>
                <div className="flex border border-border rounded-[8px] overflow-hidden">
                  {FREQS.map((f) => (
                    <button key={f} type="button" onClick={() => setFrequency(f)}
                      className={`px-2.5 py-1 text-[11px] font-medium capitalize ${frequency === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}>
                      {f}
                    </button>
                  ))}
                </div>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                  className="px-2 py-1 border border-border rounded-[8px] text-[12px] bg-transparent" />
              </div>
              <p className="text-[11px] text-muted-foreground">Updates sent to your email · education only</p>
            </div>
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              aria-label="Create radar"
              className="w-9 h-9 rounded-full bg-[var(--mint)] text-[#0E0E10] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 self-end"
            >
              {busy ? (
                <span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </form>

        {/* History rail */}
        <aside className="p-5 md:p-6 border border-border rounded-[14px] bg-[var(--surface)] min-h-[180px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold">Radar history</p>
            <div className="flex items-center gap-1.5">
              {events.length > 0 && (
                <button onClick={() => exportAllEventsPdf(events, alerts)}
                  className="text-[10px] px-2 py-0.5 border border-border rounded-md hover:bg-secondary inline-flex items-center gap-1">
                  <Download className="w-3 h-3" /> Export all
                </button>
              )}
              {alerts.length > 0 && (
                <button onClick={() => evalOne()} disabled={evalBusy !== null}
                  className="text-[10px] px-2 py-0.5 border border-border rounded-md hover:bg-secondary disabled:opacity-60">
                  {evalBusy === "all" ? "Sending…" : "Run all"}
                </button>
              )}
            </div>
          </div>

          {alerts.length === 0 && events.length === 0 ? (
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Your active radars and the updates we've sent will appear here.
            </p>
          ) : (
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {alerts.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Active</p>
                  <ul className="space-y-2">
                    {alerts.map((a) => (
                      <li key={a.id} className="py-2 border-b border-border last:border-0">
                        <p className="text-[12.5px] text-foreground line-clamp-2">{a.prompt ?? a.kind}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {a.frequency} · {a.time_aest}{a.notify_email ? " · Email" : ""}{a.notify_sms ? " · SMS" : ""}
                          </span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => evalOne(a.id)} disabled={evalBusy !== null}
                              aria-label="Run now and send update"
                              className="text-muted-foreground hover:text-foreground">
                              {evalBusy === a.id ? <span className="w-3 h-3 border-2 border-current border-r-transparent rounded-full animate-spin inline-block" /> : <Play className="w-3 h-3" />}
                            </button>
                            <button onClick={async () => {
                              try { await toggle({ data: { id: a.id, active: !a.active } } as any); }
                              catch (e: any) { setToast(e?.message ?? "Couldn't update radar."); setTimeout(() => setToast(null), 5000); }
                              refresh();
                            }}
                              className="text-[10px] text-muted-foreground hover:text-foreground">
                              {a.active ? "Pause" : "Resume"}
                            </button>
                            <button onClick={async () => { await rm({ data: { id: a.id } } as any); refresh(); }}
                              aria-label="Delete radar"
                              className="text-muted-foreground hover:text-foreground">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {events.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Updates sent</p>
                  <ul className="space-y-2">
                    {events.slice(0, 12).map((e) => (
                      <li key={e.id} className="py-2 border-b border-border last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12.5px] text-foreground line-clamp-2">{e.message}</p>
                          {e.email_status && (
                            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${e.email_status === "queued" ? "bg-[var(--mint)]/15 text-[var(--mint)]" : "bg-secondary text-muted-foreground"}`}>
                              {e.email_status === "queued" ? "sent" : "skipped"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-muted-foreground">{formatWhen(e.created_at)}</p>
                          <button
                            onClick={() => exportEventPdf(e, alerts.find((a) => a.id === e.alert_id))}
                            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            aria-label="Download PDF report"
                          >
                            <Download className="w-3 h-3" /> PDF
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Smart readiness checklist */}
      {readiness && !readiness.ready && (
        <section className="mb-6 p-5 border border-border rounded-[14px] bg-[var(--surface)]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[13px] font-semibold">Sharpen your Radar</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                These inputs unlock accurate, personalised triggers. {readiness.score}% complete.
              </p>
            </div>
            <div className="w-32 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-[var(--mint)]" style={{ width: `${readiness.score}%` }} />
            </div>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {readiness.missing.map((m: any) => (
              <li key={m.key}>
                <Link to={m.href as any}
                  className="group flex items-start gap-3 p-3 rounded-[10px] border border-border hover:border-foreground/30 transition-colors">
                  <span className="mt-0.5 w-4 h-4 rounded-full border border-border shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-foreground">{m.label}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{m.why}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground mt-1 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {readiness?.ready && (
        <div className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--mint)]/30 bg-[var(--mint)]/10 text-[12px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--mint)]" />
          All inputs connected — Radar is operating at full accuracy.
        </div>
      )}

      {/* Templates grid — curated AU starting points; click to prefill the composer */}
      <p className="text-center text-[12px] text-muted-foreground mb-4">Start from a curated Australian template</p>
      <div className="grid md:grid-cols-2 gap-2 mb-10">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickTemplate(t)}
            disabled={busy}
            className={`text-left px-4 py-3 border rounded-[10px] bg-[var(--surface)] transition-colors disabled:opacity-50 focus:outline-none ${templateId === t.id ? "border-foreground/40" : "border-border hover:border-foreground/30"}`}
          >
            <p className="text-[13px] font-semibold text-foreground">{t.title}</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-1">{t.sub}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setTemplateId(undefined); setTemplateSlug(undefined); setPrompt(""); requestAnimationFrame(() => taRef.current?.focus()); }}
          className="text-left px-4 py-3 border border-dashed border-border rounded-[10px] bg-transparent hover:border-foreground/30 transition-colors md:col-span-2"
        >
          <p className="text-[13px] font-semibold text-foreground">＋ Create your own</p>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Describe anything you want Maal to watch.</p>
        </button>
      </div>

      {/* How Radar works — forest band */}
      <section className="relative p-6 md:p-8 rounded-[14px] surface-forest text-white overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-[10px] bg-white/10 backdrop-blur flex items-center justify-center font-bold text-[15px]">M</div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold mb-1.5">How Radar works</h2>
            <p className="text-[13px] leading-relaxed text-white/80">
              Write what you'd want a CFO to flag — moves in your holdings, rate changes, spending drift, EOFY deadlines. Maal evaluates on your schedule using live market data and your profile, and emails you only when something material happens. Education only, never personal advice.
            </p>
          </div>
        </div>
      </section>

      {/* About expander */}
      <div className="mt-6 rounded-[12px] border border-border bg-[var(--surface)]">
        <button type="button" onClick={() => setShowAbout((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left">
          <span className="text-[13px] font-semibold">What is Radar?</span>
          <span className="text-muted-foreground text-[14px]">{showAbout ? "–" : "+"}</span>
        </button>
        {showAbout && (
          <div className="px-5 pb-4 text-[12px] text-muted-foreground leading-relaxed border-t border-border pt-3">
            Radars are standing watches over anything in your financial life — transactions, portfolio, stocks, rates, institutions. Example: "If BHP moves more than 10%, tell me what caused it." Maal checks on the schedule you set and emails you when conditions are met.
          </div>
        )}
      </div>

      <div className="mt-10 pt-6 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          <span className="font-semibold uppercase tracking-[0.1em]">Disclaimer:</span> Maal does not provide financial advice. Information is for educational purposes only.
        </p>
      </div>

    </div>
  );
}
