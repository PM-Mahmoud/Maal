import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/maal/SiteHeader";
import { SiteFooter } from "@/components/maal/SiteFooter";
import { ScoreRing } from "@/components/maal/ScoreRing";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { computeMaalScore, scoreBand, formatAUD, type ScoreInputs } from "@/lib/score";
import { supabase } from "@/integrations/api";
import { toast } from "sonner";

export const Route = createFileRoute("/score")({
  head: () => ({
    meta: [
      { title: "Free Maal Score Calculator — 2 minutes" },
      { name: "description", content: "Get your 0–100 Maal Financial Health Score in 2 minutes. No bank login, no credit card." },
      { property: "og:title", content: "Free Maal Score Calculator" },
      { property: "og:description", content: "Get your 0–100 Financial Health Score in 2 minutes." },
    ],
  }),
  component: ScorePage,
});

type Step = 0 | 1 | 2 | 3 | 4;

function ScorePage() {
  const [step, setStep] = useState<Step>(0);
  const [inputs, setInputs] = useState<ScoreInputs>({
    age: 35,
    income: 95_000,
    assets: 250_000,
    debts: 80_000,
    superBalance: 90_000,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="py-16 md:py-20">
          <div className="max-w-3xl mx-auto px-6">
            {step < 4 ? (
              <Wizard step={step} setStep={setStep} inputs={inputs} setInputs={setInputs} />
            ) : (
              <Result inputs={inputs} onRestart={() => setStep(0)} />
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Wizard({
  step, setStep, inputs, setInputs,
}: {
  step: Step;
  setStep: (s: Step) => void;
  inputs: ScoreInputs;
  setInputs: React.Dispatch<React.SetStateAction<ScoreInputs>>;
}) {
  type FieldKey = "age" | "income" | "assets" | "debts" | "superBalance";
  const steps: Array<{ title: string; question: string; fields: FieldKey[] }> = [
    { title: "You", question: "How old are you and what do you earn?", fields: ["age", "income"] },
    { title: "Wealth", question: "Roughly what do you own?", fields: ["assets"] },
    { title: "Debt", question: "And what do you owe?", fields: ["debts"] },
    { title: "Super", question: "What's your current super balance?", fields: ["superBalance"] },
  ];
  const cur = steps[step];
  const pct = ((step + 1) / 4) * 100;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
        Step {step + 1} of 4 · {cur.title}
      </p>
      <h1 className="text-[32px] md:text-[40px] tracking-display font-bold leading-[1.1] mb-2">{cur.question}</h1>
      <div className="h-1 bg-[var(--secondary)] rounded-full overflow-hidden mt-6">
        <div className="h-full bg-[var(--mint)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-10 space-y-6">
        {cur.fields.includes("age") && (
          <Field label="Age" suffix="years">
            <input
              type="number" min={16} max={100} value={inputs.age}
              onChange={(e) => setInputs({ ...inputs, age: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        )}
        {cur.fields.includes("income") && (
          <Field label="Annual income (before tax)" prefix="$">
            <input
              type="number" min={0} step={1000} value={inputs.income}
              onChange={(e) => setInputs({ ...inputs, income: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        )}
        {cur.fields.includes("assets") && (
          <Field label="Total assets" prefix="$" hint="Home, investments, savings — everything you own.">
            <input
              type="number" min={0} step={1000} value={inputs.assets}
              onChange={(e) => setInputs({ ...inputs, assets: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        )}
        {cur.fields.includes("debts") && (
          <Field label="Total debts" prefix="$" hint="Mortgage, HECS, car, credit cards.">
            <input
              type="number" min={0} step={1000} value={inputs.debts}
              onChange={(e) => setInputs({ ...inputs, debts: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        )}
        {cur.fields.includes("superBalance") && (
          <Field label="Super balance" prefix="$" hint="Combined across all your funds.">
            <input
              type="number" min={0} step={1000} value={inputs.superBalance}
              onChange={(e) => setInputs({ ...inputs, superBalance: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={() => setStep((Math.max(0, step - 1)) as Step)}
          disabled={step === 0}
          className="text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          onClick={() => setStep(((step + 1) as Step))}
          className="bg-foreground text-background px-5 py-2.5 rounded-[8px] text-[13px] font-semibold hover:bg-foreground/90"
        >
          {step === 3 ? "See my score" : "Continue"}
        </button>
      </div>

      <div className="mt-12">
        <Disclaimer variant="inline" />
      </div>
    </div>
  );
}

const inputCls =
  "w-full h-12 px-4 rounded-[8px] border border-border bg-[var(--surface)] text-[18px] font-bold tracking-display tabular-nums focus:outline-none focus:border-foreground";

function Field({ label, children, prefix, suffix, hint }: { label: string; children: React.ReactNode; prefix?: string; suffix?: string; hint?: string }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-semibold">{label}</span>
        {(prefix || suffix) && <span className="text-[11px] text-muted-foreground">{prefix ?? suffix}</span>}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

function Result({ inputs, onRestart }: { inputs: ScoreInputs; onRestart: () => void }) {
  const { total, netWorth, pillars } = computeMaalScore(inputs);
  const band = scoreBand(total);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("score_submissions").insert({
      age: inputs.age,
      annual_income: inputs.income,
      total_assets: inputs.assets,
      total_debts: inputs.debts,
      super_balance: inputs.superBalance,
      computed_score: total,
      email: email.trim().toLowerCase() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Saved. We'll email your full report when access opens.");
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Your result</p>
      <h1 className="text-[32px] md:text-[40px] tracking-display font-bold leading-[1.1]">
        Your Maal Score is in.
      </h1>

      <div className="mt-10 bg-[var(--surface)] border border-border rounded-[14px] p-7">
        <div className="grid sm:grid-cols-[auto_1fr] gap-7 items-center">
          <ScoreRing value={total} size={168} />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--mint)]/10 border border-[var(--mint)]/20">
              <span className="size-1.5 rounded-full bg-[var(--mint)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--mint)]">{band.label}</span>
            </div>
            <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed max-w-md">
              Based on what you told us, your net worth is{" "}
              <span className="font-semibold text-foreground tabular-nums">{formatAUD(netWorth)}</span>.
              Here's how each pillar contributed.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border space-y-3.5">
          {pillars.map((p) => (
            <div key={p.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span>{p.label} <span className="text-muted-foreground">· {p.weight}%</span></span>
                <span className="tabular-nums font-semibold">{p.score}</span>
              </div>
              <div className="h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${p.score}%`,
                    background: p.score < 50 ? "var(--gold)" : "var(--foreground)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!sent ? (
        <form onSubmit={saveEmail} className="mt-8 p-6 rounded-[14px] border border-border bg-[var(--secondary)]/40">
          <p className="text-[13px] font-semibold mb-1">Get the full report</p>
          <p className="text-[12px] text-muted-foreground mb-4">We'll email a deeper breakdown plus next-step priorities.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 h-11 px-3.5 rounded-[8px] border border-border bg-[var(--surface)] text-[14px] focus:outline-none focus:border-foreground"
            />
            <button type="submit" className="h-11 px-5 rounded-[8px] bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90">
              Email my report
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-8 p-6 rounded-[14px] border border-[var(--mint)]/30 bg-[var(--mint)]/5">
          <p className="text-[13px] font-semibold">You're set.</p>
          <p className="text-[12px] text-muted-foreground mt-1">Your report is queued. <Link to="/auth" className="underline">Create an account</Link> to track your score over time.</p>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button onClick={onRestart} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
          ← Start over
        </button>
        <Link to="/pricing" className="text-[13px] font-semibold">See pricing →</Link>
      </div>

      <div className="mt-12">
        <Disclaimer variant="inline" />
      </div>
    </div>
  );
}