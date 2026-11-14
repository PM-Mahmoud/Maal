import { useEffect, useId, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { createThread } from "@/lib/advisor.functions";
import { supabase } from "@/integrations/api";
import { MANDATORY_DISCLAIMER, sendBriefFeedback, type BriefKind } from "./api";

/** "More like this" / "Less like this" (Figma: Giving feedback from Weekly
 *  recap). The selected chip turns black; the vote is saved to the feedback
 *  table. Picking the other chip records the change. */
export function FeedbackButtons({ brief, slide, period }: { brief: BriefKind; slide: string; period: string }) {
  // The remembered vote is scoped to the signed-in user, so someone else on
  // the same browser doesn't see it. No user id → nothing is read or stored.
  const [userId, setUserId] = useState<string | null>(null);
  const storageKey = userId ? `maal_brief_fb:${userId}:${brief}:${period}:${slide}` : null;
  const [vote, setVote] = useState<"more" | "less" | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (alive) setUserId(data.user?.id ? String(data.user.id) : null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!storageKey) return;
    try { const v = localStorage.getItem(storageKey); setVote(v === "more" || v === "less" ? v : null); } catch { /* ignore */ }
  }, [storageKey]);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const statusId = useId();

  async function choose(next: "more" | "less") {
    if (vote === next) return;
    const previous = vote;
    setVote(next);
    setStatus("idle");
    try {
      await sendBriefFeedback({ brief, slide, vote: next, period });
      if (storageKey) { try { localStorage.setItem(storageKey, next); } catch { /* ignore */ } }
      setStatus("saved");
    } catch {
      setVote(previous);
      setStatus("error");
    }
  }

  return (
    <div>
      <div className="mb-feedback" role="group" aria-label="Was this useful?" aria-describedby={statusId}>
        <button type="button" className="mb-chip" aria-pressed={vote === "more"} onClick={() => choose("more")}>
          <ThumbsUp size={13} strokeWidth={1.8} /> More like this
        </button>
        <button type="button" className="mb-chip" aria-pressed={vote === "less"} onClick={() => choose("less")}>
          <ThumbsDown size={13} strokeWidth={1.8} /> Less like this
        </button>
      </div>
      <p className="mb-thanks" id={statusId} aria-live="polite">
        {status === "saved" ? "Thanks — we’ll use this to shape your briefs." : status === "error" ? "Couldn’t save that. Try again." : ""}
      </p>
    </div>
  );
}

/** Monochrome-friendly area + line chart (Figma net worth / index charts).
 *  Draws the given values only — no smoothing beyond a gentle curve. */
export function TrendChart({
  values,
  color = "var(--mb-line)",
  height = 128,
  showGrid = true,
  showPoint = true,
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  showGrid?: boolean;
  showPoint?: boolean;
  label: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const W = 522;
  const H = height;
  const pad = 8;
  // Tolerate a missing/odd series from the API: chart only finite numbers.
  const clean = Array.isArray(values) ? values.filter((v) => typeof v === "number" && Number.isFinite(v)) : [];
  const pts = clean.length === 1 ? [clean[0], clean[0]] : clean;
  if (!pts.length) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || Math.max(1, Math.abs(max) * 0.02);
  const plotW = showPoint ? W * 0.83 : W;
  const x = (i: number) => (pts.length === 1 ? 0 : (i / (pts.length - 1)) * plotW);
  const y = (v: number) => pad + (1 - (v - (max === min ? min - span / 2 : min)) / span) * (H - pad * 2);
  const coords = pts.map((v, i) => [x(i), y(v)] as const);
  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const last = coords[coords.length - 1];
  const area = `${d} L ${last[0]} ${H} L 0 ${H} Z`;

  return (
    <svg className="mb-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showGrid
        ? [0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="0" x2={W} y1={pad + (i * (H - pad * 2)) / 4} y2={pad + (i * (H - pad * 2)) / 4} stroke="#E4E4E0" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))
        : null}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      {showPoint ? (
        <>
          <circle cx={last[0]} cy={last[1]} r="9" fill={color} opacity="0.18" />
          <circle cx={last[0]} cy={last[1]} r="4.5" fill={color} />
        </>
      ) : null}
    </svg>
  );
}

/** Closing slide action: opens a new Ask Maal thread pre-filled with a
 *  follow-up question (same hand-off as the dashboard AskMaalTile). */
export function DiveDeeperButton({ question }: { question: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      const thread = (await createThread()) as { id: string };
      try { localStorage.setItem(`maal_autosend_${thread.id}`, question); } catch { /* ignore */ }
      navigate({ to: "/app/advisor/$threadId", params: { threadId: thread.id } });
    } catch {
      setErr(true);
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="mb-cta" onClick={go} disabled={busy}>
        <Sparkles size={15} strokeWidth={1.8} color="#7B61FF" /> {busy ? "Opening…" : "Dive deeper"}
      </button>
      {err ? <p style={{ marginTop: 12, fontSize: 14 }}>Couldn’t open a chat. Try again.</p> : null}
    </>
  );
}

export function BriefDisclaimer() {
  return <p className="mb-disclaimer">{MANDATORY_DISCLAIMER}</p>;
}
