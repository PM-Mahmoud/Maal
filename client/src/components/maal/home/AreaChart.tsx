import { useId, useMemo } from "react";
import { audCompact, aud, shortDate } from "./format";

type Point = { date: string; value: number };

const W = 1000;
const GUTTER = 70; // right-hand axis labels (in viewBox units, ~ px at 1000 wide)

/**
 * Responsive area chart in the Home style: soft blue fill, 2px line, dashed
 * gridlines, a dot on the latest value and compact AUD labels on the right.
 * With fewer than two points it draws a faint baseline and an overlay message.
 */
export function AreaChart({
  points,
  height = 170,
  emptyMessage,
  compact = false,
  label,
}: {
  points: Point[];
  height?: number;
  emptyMessage?: string;
  compact?: boolean;
  label: string;
}) {
  const gid = useId().replace(/:/g, "");
  const H = height;
  const plotW = compact ? W : W - GUTTER;
  const pad = 8;

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) { min -= Math.max(1, Math.abs(min) * 0.05); max += Math.max(1, Math.abs(max) * 0.05); }
    const span = max - min;
    const x = (i: number) => (i / (points.length - 1)) * (plotW - 8);
    const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L0,${H} Z`;
    const ticks = [0, 1, 2, 3].map((k) => {
      const v = max - (span * (k + 0.5)) / 4;
      return { v, y: y(v) };
    });
    const last = points[points.length - 1];
    return { line, area, ticks, lastX: x(points.length - 1), lastY: y(last.value) };
  }, [points, plotW, H]);

  const first = points[0];
  const last = points[points.length - 1];
  const summary = geo && first && last
    ? `${label}: ${aud(first.value)} on ${shortDate(first.date)} to ${aud(last.value)} on ${shortDate(last.date)}`
    : `${label}: not enough history yet`;

  return (
    <div className="mh-chart" style={{ height: H }} role="img" aria-label={summary}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`mh-fill-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--mh-chart)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--mh-chart)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {!compact && [0.02, 0.25, 0.5, 0.75, 0.98].map((f) => (
          <line key={f} x1="0" x2={plotW} y1={f * H} y2={f * H} stroke="var(--mh-line)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ))}
        {geo ? (
          <>
            <path d={geo.area} fill={`url(#mh-fill-${gid})`} />
            <path d={geo.line} fill="none" stroke="var(--mh-chart)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </>
        ) : (
          <path d={`M0,${H * 0.7} C${plotW * 0.3},${H * 0.62} ${plotW * 0.6},${H * 0.6} ${plotW},${H * 0.2}`}
            fill="none" stroke="var(--mh-line-strong)" strokeWidth="2" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {geo && (
        <>
          <span aria-hidden style={{
            position: "absolute", left: `${(geo.lastX / W) * 100}%`, top: geo.lastY,
            width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: 99, background: "var(--mh-chart)",
            boxShadow: "0 0 0 3px var(--mh-card)",
          }} />
          {!compact && geo.ticks.map((t) => (
            <span key={t.y} aria-hidden className="mh-amount" style={{
              position: "absolute", right: 0, top: t.y, transform: "translateY(-50%)",
              fontSize: 12, color: "var(--mh-faint)", fontVariantNumeric: "tabular-nums",
            }}>{audCompact(t.v)}</span>
          ))}
        </>
      )}
      {!geo && emptyMessage && <div className="mh-chart-empty">{emptyMessage}</div>}
    </div>
  );
}
