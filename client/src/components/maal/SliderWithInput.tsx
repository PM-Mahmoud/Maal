import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

/**
 * A slider paired with a free-text number box.
 *
 * The point of this component: the slider is a convenience for exploring, NOT a
 * constraint on what the user is allowed to be. Several calculators previously
 * capped income at $400k or age at 55, which silently told higher earners and
 * older users that the tool was not for them. Here the slider's `max` only
 * bounds the THUMB; anything typed into the box is accepted up to `hardMax`,
 * and the slider simply pins to its own maximum when the value exceeds it.
 *
 * Empty input is allowed while editing (so the field can be cleared and
 * retyped) and commits as `min` on blur.
 */
export function SliderWithInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  hardMax = 1_000_000_000,
  format,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  /** Upper bound for TYPED input. The slider still tops out at `max`. */
  hardMax?: number;
  /** Display formatter for the read-out (e.g. formatAUD). */
  format?: (v: number) => string;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  // Local text state so the user can clear the field mid-edit without the
  // parent immediately coercing it back to a number.
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  function commit(raw: string) {
    const cleaned = raw.replace(/[^0-9.-]/g, "");
    if (cleaned === "" || cleaned === "-") { onChange(min); setText(String(min)); return; }
    const n = Number(cleaned);
    if (!Number.isFinite(n)) { setText(String(value)); return; }
    const clamped = Math.min(Math.max(n, min), hardMax);
    onChange(clamped);
    setText(String(clamped));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {format && <span className="text-xs font-medium text-foreground tabular-nums">{format(value)}</span>}
      </div>

      <div className="flex items-center gap-2">
        <Slider
          value={[Math.min(Math.max(value, min), max)]}
          onValueChange={([v]) => onChange(v)}
          min={min}
          max={max}
          step={step}
          className="flex-1"
        />
        <div className="flex items-center gap-1 shrink-0">
          {prefix && <span className="text-[11px] text-muted-foreground">{prefix}</span>}
          <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
            className="w-24 px-2 py-1 rounded-[8px] border border-border bg-background text-[12px] tabular-nums text-right outline-none focus:border-foreground transition-colors"
          />
          {suffix && <span className="text-[11px] text-muted-foreground">{suffix}</span>}
        </div>
      </div>

      {value > max && (
        <p className="text-[10px] text-muted-foreground">
          Above the slider range, and being used exactly as typed.
        </p>
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
