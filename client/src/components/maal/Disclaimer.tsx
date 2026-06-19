export function Disclaimer({ variant = "footer" }: { variant?: "footer" | "inline" }) {
  if (variant === "inline") {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground tracking-wide">
        Maal does not provide financial advice. Information is for educational purposes only.
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
          Maal does not provide financial advice. Any information, scores, or action plans are generated from
          mathematical models for educational purposes only and do not take into account your personal objectives,
          financial situation, or needs. Consider the appropriateness of the information and seek qualified
          professional advice before acting.
        </p>
      </div>
    </div>
  );
}