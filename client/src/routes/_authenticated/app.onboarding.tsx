import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/api";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/onboarding")({
  component: OnboardingWizard,
});

type State = {
  display_name: string;
  age_band: "under-30" | "30-39" | "40-49" | "50-59" | "60+";
  annual_income: string;
  super_balance: string;
  investments_value: string;
  cash_balance: string;
  hecs_balance: string;
  risk: "conservative" | "balanced" | "growth" | "high_growth";
  retirement_age: string;
  monthly_expenses: string;
};

const STEPS = [
  "About you",
  "Income",
  "Super",
  "Investments & cash",
  "Debts",
  "Goals & risk",
] as const;

function OnboardingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<State>({
    display_name: "",
    age_band: "30-39",
    annual_income: "",
    super_balance: "",
    investments_value: "",
    cash_balance: "",
    hecs_balance: "",
    risk: "balanced",
    retirement_age: "67",
    monthly_expenses: "",
  });

  useEffect(() => {
    supabase.from("profiles").select("display_name, age_band").maybeSingle().then(({ data }) => {
      if (data) setS((x) => ({
        ...x,
        display_name: data.display_name ?? "",
        age_band: (data.age_band as State["age_band"]) ?? "30-39",
      }));
    });
  }, []);

  const u = (k: keyof State, v: string) => setS((x) => ({ ...x, [k]: v }));
  const n = (v: string) => (v === "" ? 0 : Number(v));

  async function finish() {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      await supabase.from("profiles").update({
        display_name: s.display_name,
        age_band: s.age_band,
        ethical_preference: "none", // values-agnostic: column retained, neutral default
        onboarded: true,
      }).eq("id", uid);
      const writes: Promise<any>[] = [];
      const push = (q: any) => writes.push(Promise.resolve(q));
      if (n(s.annual_income) > 0)
        push(supabase.from("incomes").insert({ user_id: uid, annual_amount: n(s.annual_income) }));
      if (n(s.super_balance) > 0)
        push(supabase.from("super_accounts").insert({ user_id: uid, fund_name: "My super", balance: n(s.super_balance) }));
      if (n(s.investments_value) > 0)
        push(supabase.from("investments").insert({ user_id: uid, name: "Portfolio", value: n(s.investments_value), kind: "etf" }));
      if (n(s.cash_balance) > 0)
        push(supabase.from("cash_accounts").insert({ user_id: uid, label: "Savings", balance: n(s.cash_balance), kind: "savings" }));
      if (n(s.hecs_balance) > 0)
        push(supabase.from("debts").insert({ user_id: uid, label: "HECS", balance: n(s.hecs_balance), kind: "hecs" }));
      push(supabase.from("preferences").upsert({
        user_id: uid,
        risk: s.risk,
        retirement_age: Number(s.retirement_age) || 67,
        monthly_expenses: n(s.monthly_expenses),
      }));
      await Promise.all(writes);
      toast.success("Onboarding complete");
      navigate({ to: "/app" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 md:px-10 py-12">
      <div className="flex items-center gap-1.5 mb-6">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[var(--mint)]" : "bg-[var(--secondary)]"}`} />
        ))}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="text-[28px] tracking-display font-bold leading-tight mb-8">{STEPS[step]}</h1>

      <div className="space-y-4">
        {step === 0 && (
          <>
            <Field label="Preferred name">
              <input className={inp} value={s.display_name} onChange={(e) => u("display_name", e.target.value)} placeholder="Alex" />
            </Field>
            <Field label="Age band">
              <Segmented
                value={s.age_band}
                onChange={(v) => u("age_band", v)}
                options={[
                  { v: "under-30", l: "<30" },
                  { v: "30-39", l: "30s" },
                  { v: "40-49", l: "40s" },
                  { v: "50-59", l: "50s" },
                  { v: "60+", l: "60+" },
                ]}
              />
            </Field>
          </>
        )}
        {step === 1 && (
          <Field label="Annual income before tax (AUD)">
            <input className={inp} inputMode="numeric" value={s.annual_income}
              onChange={(e) => u("annual_income", e.target.value)} placeholder="120000" />
          </Field>
        )}
        {step === 2 && (
          <Field label="Total super balance (AUD)">
            <input className={inp} inputMode="numeric" value={s.super_balance}
              onChange={(e) => u("super_balance", e.target.value)} placeholder="85000" />
          </Field>
        )}
        {step === 3 && (
          <>
            <Field label="Investments — ETFs, shares, funds (AUD)">
              <input className={inp} inputMode="numeric" value={s.investments_value}
                onChange={(e) => u("investments_value", e.target.value)} placeholder="20000" />
            </Field>
            <Field label="Cash & savings (AUD)">
              <input className={inp} inputMode="numeric" value={s.cash_balance}
                onChange={(e) => u("cash_balance", e.target.value)} placeholder="15000" />
            </Field>
          </>
        )}
        {step === 4 && (
          <Field label="HECS / HELP balance (AUD)">
            <input className={inp} inputMode="numeric" value={s.hecs_balance}
              onChange={(e) => u("hecs_balance", e.target.value)} placeholder="0" />
          </Field>
        )}
        {step === 5 && (
          <>
            <Field label="Risk tolerance">
              <Segmented
                value={s.risk}
                onChange={(v) => u("risk", v)}
                options={[
                  { v: "conservative", l: "Conservative" },
                  { v: "balanced", l: "Balanced" },
                  { v: "growth", l: "Growth" },
                  { v: "high_growth", l: "High growth" },
                ]}
              />
            </Field>
            <Field label="Target retirement age">
              <input className={inp} inputMode="numeric" value={s.retirement_age}
                onChange={(e) => u("retirement_age", e.target.value)} />
            </Field>
            <Field label="Monthly expenses (AUD)">
              <input className={inp} inputMode="numeric" value={s.monthly_expenses}
                onChange={(e) => u("monthly_expenses", e.target.value)} placeholder="4500" />
            </Field>
          </>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={() => setStep((x) => Math.max(0, x - 1))}
          disabled={step === 0}
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((x) => x + 1)}
            className="bg-foreground text-background px-5 py-2.5 rounded-[8px] text-[13px] font-semibold"
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={saving}
            className="bg-foreground text-background px-5 py-2.5 rounded-[8px] text-[13px] font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Finish & see my Score"}
          </button>
        )}
      </div>
    </div>
  );
}

const inp = "w-full h-11 px-3.5 rounded-[8px] border border-border bg-[var(--surface)] text-[14px] focus:outline-none focus:border-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-muted-foreground mb-2">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--secondary)] rounded-[10px] w-fit">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3.5 h-9 rounded-[8px] text-[12.5px] font-medium transition-colors ${
            value === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}