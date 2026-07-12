import { AreaChart } from "@/components/maal/AreaChart";
import type { WidgetSpec } from "@/lib/widgets.functions";

// Monochrome donut segment shades (design system: charts are ink, not colour).
const DONUT_SHADES = ["var(--foreground)", "#6B6F76", "#9CA0A6", "#C7CACE", "#E2E4E6"];

function Donut({ data }: { data: any }) {
  const segments: { label: string; value: number; valueLabel: string; pct: number }[] = data?.segments ?? [];
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R, cx = 70, cy = 70;
  let offset = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 140 140" className="w-[140px] h-[140px] shrink-0" role="img" aria-label="Composition donut chart">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--secondary)" strokeWidth="16" />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * C;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={DONUT_SHADES[i % DONUT_SHADES.length]}
              strokeWidth="16" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-foreground" style={{ fontSize: 13, fontWeight: 700 }}>
          {data?.totalLabel ?? ""}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 8 }}>total</text>
      </svg>
      <ul className="space-y-1.5 text-[12px] min-w-[140px]">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] shrink-0" style={{ background: DONUT_SHADES[i % DONUT_SHADES.length] }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.valueLabel} · {s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ data }: { data: any }) {
  const columns: string[] = data?.columns ?? [];
  const rows: Record<string, any>[] = data?.rows ?? [];
  return (
    <div className="overflow-x-auto">
      {data?.caption && <p className="text-[12px] text-muted-foreground mb-2">{data.caption}</p>}
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            {columns.map((c) => <th key={c} className="py-1.5 pr-4 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {columns.map((c) => <td key={c} className="py-1.5 pr-4 tabular-nums">{String(row[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCards({ data }: { data: any }) {
  const cards: { label: string; value: string }[] = data?.cards ?? [];
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="rounded-[10px] border border-border bg-background p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{c.label}</p>
          <p className="text-[16px] font-bold tracking-display tabular-nums mt-0.5">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function Line({ data }: { data: any }) {
  const points: number[] = data?.points ?? [];
  const labels: string[] = data?.labels ?? [];
  const fmt = data?.format === "currency"
    ? (v: number) => "$" + Math.round(v).toLocaleString("en-AU")
    : undefined;
  return <AreaChart data={points} labels={labels} height={160} formatY={fmt} ariaLabel="Trend chart" />;
}

/** Renders an Ask Maal generative-UI widget (or a saved dashboard widget). */
export function WidgetRenderer({ widget, action }: { widget: WidgetSpec; action?: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-[var(--surface)] p-4 my-2">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="text-[13px] font-semibold tracking-display">{widget.title}</h4>
        {action}
      </div>
      {widget.type === "donut" && <Donut data={widget.data} />}
      {widget.type === "table" && <Table data={widget.data} />}
      {widget.type === "stat-cards" && <StatCards data={widget.data} />}
      {widget.type === "line" && <Line data={widget.data} />}
    </div>
  );
}
