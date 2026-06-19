import { ScoreRing } from "./ScoreRing";
import { Sparkline } from "./Sparkline";

const pillars = [
  { label: "Net Worth", value: 84, tone: "good" as const },
  { label: "Debt Health", value: 71, tone: "ok" as const },
  { label: "Super Adequacy", value: 62, tone: "ok" as const },
  { label: "Diversification", value: 48, tone: "warn" as const },
  { label: "Emergency Buffer", value: 78, tone: "good" as const },
];

const tiles = [
  { label: "Net Worth", value: "$612k", delta: "+4.2%", positive: true, data: [12, 13, 14, 13, 16, 17, 19, 21] },
  { label: "Investments", value: "$184k", delta: "+1.8%", positive: true, data: [10, 11, 11, 12, 12, 13, 14, 15] },
  { label: "Cash", value: "$42k", delta: "+0.4%", positive: true, data: [8, 9, 9, 10, 10, 10, 11, 11] },
  { label: "Debts", value: "$298k", delta: "-2.1%", positive: true, data: [20, 19, 19, 18, 18, 17, 16, 15] },
];

export function DashboardPreview() {
  return (
    <div className="bg-[var(--surface)] border border-border rounded-[14px] p-6 md:p-7">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Overview · This week
          </p>
          <p className="text-[13px] text-muted-foreground">Live as of just now</p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--mint)]/10 border border-[var(--mint)]/20">
          <span className="size-1.5 rounded-full bg-[var(--mint)] animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--mint)]">Synced</span>
        </div>
      </div>

      <div className="grid md:grid-cols-[auto_1fr] gap-7 items-start mb-7">
        <ScoreRing value={74} />
        <div className="space-y-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Structural pillars
          </p>
          {pillars.map((p) => (
            <div key={p.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-foreground">{p.label}</span>
                <span className="tabular-nums font-semibold">{p.value}</span>
              </div>
              <div className="h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${p.value}%`,
                    background: p.tone === "warn" ? "var(--gold)" : "var(--foreground)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 border-t border-border">
        {tiles.map((t) => (
          <div key={t.label} className="p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {t.label}
            </p>
            <p className="text-[20px] font-bold tracking-display tabular-nums">{t.value}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <Sparkline data={t.data} width={70} height={22} positive={t.positive} />
              <span className="text-[10px] font-bold text-[var(--mint)] tabular-nums">{t.delta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}