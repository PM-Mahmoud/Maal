// The exact mandatory disclaimer required on every page (see CLAUDE.md).
const MANDATORY_DISCLAIMER =
  "Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.";

export function Disclaimer({ variant = "footer" }: { variant?: "footer" | "inline" }) {
  if (variant === "inline") {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground tracking-wide">
        {MANDATORY_DISCLAIMER}
      </p>
    );
  }
  return (
    <div className="border-t border-border bg-[var(--secondary)]/40">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Educational disclaimer
        </p>
        <p className="text-[12px] leading-relaxed text-muted-foreground max-w-3xl">
          {MANDATORY_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}