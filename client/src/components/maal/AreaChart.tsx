import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number; v: number; label: string };

export function AreaChart({
  data,
  labels,
  height = 220,
  positive = true,
  formatY,
  formatX,
  ariaLabel,
  interactive = true,
}: {
  data: number[];
  /** Per-point labels (e.g. "Mar 2024"). Falls back to formatX or index. */
  labels?: string[];
  height?: number;
  positive?: boolean;
  formatY?: (v: number) => string;
  formatX?: (i: number, total: number) => string;
  ariaLabel?: string;
  interactive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(560);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradId = useId();

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setWidth(Math.max(280, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padX = 44;
  const padY = 20;
  const padBottom = 28;
  const innerW = Math.max(10, width - padX * 2);
  const innerH = Math.max(40, height - padY - padBottom);

  const { pts, min, max, span, line, area, stroke } = useMemo(() => {
    const safe = data.length >= 2 ? data : [];
    const min = safe.length ? Math.min(...safe) : 0;
    const max = safe.length ? Math.max(...safe) : 1;
    const span = max - min || Math.max(Math.abs(max), 1);
    const step = safe.length > 1 ? innerW / (safe.length - 1) : 0;
    const pts: Point[] = safe.map((v, i) => ({
      x: padX + i * step,
      y: padY + innerH - ((v - min) / span) * innerH,
      v,
      label: labels?.[i] ?? (formatX ? formatX(i, safe.length) : `Point ${i + 1}`),
    }));
    const line = pts.length
      ? `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
      : "";
    const area = pts.length
      ? `${line} L ${pts[pts.length - 1].x.toFixed(1)},${padY + innerH} L ${pts[0].x.toFixed(1)},${padY + innerH} Z`
      : "";
    const stroke = positive ? "var(--mint)" : "var(--foreground)";
    return { pts, min, max, span, line, area, stroke };
  }, [data, labels, formatX, innerW, innerH, padX, padY, positive]);

  if (pts.length < 2) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center text-[12px] text-muted-foreground border border-dashed border-border rounded-[10px]"
        style={{ height }}
      >
        Not enough history yet — we'll fill this in as your numbers change.
      </div>
    );
  }

  const ticks = Array.from({ length: 4 }, (_, i) => {
    const t = i / 3;
    return { y: padY + innerH * t, v: max - span * t };
  });

  function pointFromClientX(clientX: number) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = width / rect.width;
    const xInSvg = (clientX - rect.left) * ratio;
    const step = pts.length > 1 ? innerW / (pts.length - 1) : 0;
    const idx = Math.round((xInSvg - padX) / step);
    return Math.max(0, Math.min(pts.length - 1, idx));
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    const idx = pointFromClientX(e.clientX);
    if (idx !== null) setHoverIdx(idx);
  }
  function handleLeave() {
    setHoverIdx(null);
  }
  function handleKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (!interactive) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setHoverIdx((cur) => {
        const start = cur ?? pts.length - 1;
        const next = e.key === "ArrowRight" ? start + 1 : start - 1;
        return Math.max(0, Math.min(pts.length - 1, next));
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      setHoverIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHoverIdx(pts.length - 1);
    } else if (e.key === "Escape") {
      setHoverIdx(null);
    }
  }

  // Selected point (hover/keyboard); falls back to last for the live summary.
  const sel = hoverIdx != null ? pts[hoverIdx] : pts[pts.length - 1];
  const first = pts[0];
  const prev = hoverIdx != null && hoverIdx > 0 ? pts[hoverIdx - 1] : null;
  const deltaFromFirst = sel.v - first.v;
  const pctFromFirst = first.v ? (deltaFromFirst / Math.abs(first.v)) * 100 : 0;
  const deltaPrev = prev ? sel.v - prev.v : null;
  const pctPrev = prev && prev.v ? ((sel.v - prev.v) / Math.abs(prev.v)) * 100 : null;

  // Tooltip placement (flip when near right edge).
  const tipW = 200;
  const tipFlip = sel.x + tipW + 16 > width;
  const tipX = tipFlip ? sel.x - tipW - 12 : sel.x + 12;
  const tipY = Math.max(padY, Math.min(sel.y - 30, height - 110));

  // Live region announcement (announce on keyboard nav only).
  const announcement =
    hoverIdx != null
      ? `${sel.label}: ${formatY ? formatY(sel.v) : sel.v}, ${
          deltaFromFirst >= 0 ? "up" : "down"
        } ${formatY ? formatY(Math.abs(deltaFromFirst)) : Math.abs(deltaFromFirst)} (${pctFromFirst.toFixed(1)} percent) since start.`
      : "";

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 rounded-[10px]"
        role="img"
        aria-label={ariaLabel ?? "Time-series area chart"}
        tabIndex={interactive ? 0 : -1}
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={handleLeave}
        onKeyDown={handleKey}
        onBlur={handleLeave}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padX}
              x2={width - padX}
              y1={t.y}
              y2={t.y}
              stroke="var(--border)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <text
              x={padX - 8}
              y={t.y + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted-foreground)"
              className="tabular-nums"
            >
              {formatY ? formatY(t.v) : Math.round(t.v).toString()}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1,
            animation: "area-draw 900ms cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        />

        {/* axis labels */}
        <text x={padX} y={height - 8} fontSize="10" fill="var(--muted-foreground)">
          {first.label}
        </text>
        <text
          x={width - padX}
          y={height - 8}
          textAnchor="end"
          fontSize="10"
          fill="var(--muted-foreground)"
        >
          {pts[pts.length - 1].label}
        </text>

        {/* end point dot */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={stroke} />

        {/* crosshair */}
        {hoverIdx != null && (
          <g pointerEvents="none">
            <line
              x1={sel.x}
              x2={sel.x}
              y1={padY}
              y2={padY + innerH}
              stroke="var(--foreground)"
              strokeOpacity={0.25}
              strokeDasharray="3 3"
            />
            <circle cx={sel.x} cy={sel.y} r={5} fill="var(--background)" stroke={stroke} strokeWidth={2} />
            <g transform={`translate(${tipX}, ${tipY})`}>
              <rect
                width={tipW}
                height={92}
                rx={8}
                fill="var(--background)"
                stroke="var(--border)"
              />
              <text x={12} y={20} fontSize="10" fill="var(--muted-foreground)" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {sel.label}
              </text>
              <text x={12} y={42} fontSize="15" fontWeight={700} fill="var(--foreground)" className="tabular-nums">
                {formatY ? formatY(sel.v) : sel.v.toString()}
              </text>
              <text x={12} y={62} fontSize="11" fill={deltaFromFirst >= 0 ? "var(--mint)" : "var(--foreground)"} className="tabular-nums">
                {deltaFromFirst >= 0 ? "▲" : "▼"} {formatY ? formatY(Math.abs(deltaFromFirst)) : Math.abs(deltaFromFirst)} ({pctFromFirst >= 0 ? "+" : ""}{pctFromFirst.toFixed(1)}%) vs start
              </text>
              {deltaPrev !== null && (
                <text x={12} y={80} fontSize="11" fill="var(--muted-foreground)" className="tabular-nums">
                  {deltaPrev >= 0 ? "▲" : "▼"} {formatY ? formatY(Math.abs(deltaPrev)) : Math.abs(deltaPrev)}{pctPrev !== null ? ` (${pctPrev >= 0 ? "+" : ""}${pctPrev.toFixed(1)}%)` : ""} vs prev
                </text>
              )}
            </g>
          </g>
        )}
        <style>{`@keyframes area-draw{to{stroke-dashoffset:0}}`}</style>
      </svg>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  );
}