import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AreaChart } from "./AreaChart";
import { formatAUD } from "@/lib/score";

type Range = "1Y" | "3Y" | "5Y" | "ALL";

const RANGES: { key: Range; label: string; months: number }[] = [
  { key: "1Y", label: "1Y", months: 12 },
  { key: "3Y", label: "3Y", months: 36 },
  { key: "5Y", label: "5Y", months: 60 },
  { key: "ALL", label: "All", months: 84 },
];

// Deterministic seeded RNG so series are stable per (key, range).
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashKey(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildSeries(months: number, current: number): number[] {
  // Flat line at current value — no fake growth projection.
  return new Array(months).fill(current ?? 0);
}
function monthLabel(monthsAgo: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

export function ChartModal({
  open,
  onOpenChange,
  title,
  seriesKey,
  current,
  positive,
  valueFormatted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  seriesKey: string;
  current: number;
  positive: boolean;
  valueFormatted: string;
}) {
  const [range, setRange] = useState<Range>("1Y");
  const months = RANGES.find((r) => r.key === range)!.months;

  const { series, labels } = useMemo(() => {
    const s = buildSeries(months, current ?? 0);
    const l = s.map((_, i) => monthLabel(months - 1 - i));
    return { series: s, labels: l };
  }, [seriesKey, range, months, current, positive]);

  const first = series[0] || 0;
  const last = series[series.length - 1] || 0;
  const delta = last - first;
  const pct = first ? (delta / Math.abs(first)) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1100px,96vw)] w-[96vw] h-[88vh] sm:rounded-[16px] p-0 gap-0 flex flex-col">
        <div className="px-6 md:px-10 pt-6 md:pt-8 pb-4 border-b border-border">
          <DialogTitle asChild>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </h2>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Interactive area chart of {title}. Use arrow keys to scrub through points.
          </DialogDescription>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[34px] font-bold tracking-display leading-none">{valueFormatted}</p>
              <p
                className={`mt-2 text-[13px] font-semibold tabular-nums ${
                  delta >= 0 ? "text-[var(--mint)]" : "text-foreground"
                }`}
              >
                {delta >= 0 ? "▲" : "▼"} {formatAUD(Math.abs(delta))} ({pct >= 0 ? "+" : ""}
                {pct.toFixed(1)}%) <span className="text-muted-foreground font-normal">over {range === "ALL" ? "all time" : range}</span>
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Time range"
              className="inline-flex p-1 bg-[var(--secondary)] rounded-[10px]"
            >
              {RANGES.map((r) => {
                const active = r.key === range;
                return (
                  <button
                    key={r.key}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setRange(r.key)}
                    className={`px-3 py-1.5 text-[12px] font-semibold rounded-[8px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 ${
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-6 md:px-10 py-6 overflow-auto">
          <AreaChart
            data={series}
            labels={labels}
            height={420}
            positive={positive}
            formatY={(v) => formatAUD(v)}
            ariaLabel={`${title} over the last ${range}. Use left and right arrow keys to scrub through points.`}
          />
          <p className="mt-4 text-[11px] text-muted-foreground">
            Tip: hover, tap or use ← → arrow keys to inspect exact values and changes. Press Home / End to jump to the start or end.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}