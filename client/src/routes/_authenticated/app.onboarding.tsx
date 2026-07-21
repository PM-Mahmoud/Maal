import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/api";
import { fetchProfile, saveProfile } from "@/lib/profile";
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

// Sane upper bound for a single money field — catches pasted garbage without
// rejecting any realistic figure.
const MONEY_MAX = 1_000_000_000;

// Parse a money field once: blank means "not provided" (0); anything else must
// be a finite, non-negative number within a sane range. Throws with the field
// label so the user knows what to fix.
function parseMoney(label: string, v: string): number {
  const t = v.trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > MONEY_MAX)
    throw new Error(`${label} must be a number between 0 and ${MONEY_MAX.toLocaleString("en-AU")}.`);
  return n;
}

function parseRetirementAge(v: string): number {
  const t = v.trim();
  if (t === "") return 67; // default when left blank
  const n = Number(t);
  if (!Number.isFinite(n) || n < 18 || n > 100)
    throw new Error("Target retirement age must be a number between 18 and 100.");
  return Math.round(n);
}

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

  const [hydrating, setHydrating] = useState(true);

  // Hydrate EVERY field, not just name and age band. This page previously
  // prefilled two of ten fields, so a returning user saw their income, super,
  // investments, cash, HECS and expenses blank on every visit and concluded
  // Maal had forgotten them. The values were in Postgres the whole time.
  useEffect(() => {
    fetchProfile()
      .then((data) => {
        if (!data) return;
        // Money columns arrive as BIGINT strings; blank them rather than
        // showing "0" so an untouched field still reads as unanswered.
        const money = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? String(n) : "";
        };
        setS((x) => ({
          ...x,
          display_name: data.display_name ?? x.display_name,
          age_band: (data.age_band as State["age_band"]) ?? x.age_band,
          risk: (data.risk as State["risk"]) ?? x.risk,
          annual_income: money(data.annual_income),
          super_balance: money(data.super_balance),
          investments_value: money(data.investment_portfolio),
          cash_balance: money(data.cash_savings),
          hecs_balance: money(data.hecs_balance),
          monthly_expenses: money(data.monthly_expenses),
          retirement_age: data.retirement_age ? String(data.retirement_age) : x.retirement_age,
        }));
      })
      .finally(() => setHydrating(false));
  }, []);

  const u = (k: keyof State, v: string) => setS((x) => ({ ...x, [k]: v }));

  async function finish() {
    if (saving) return; // never run two submit flows at once
    // Validate every numeric input BEFORE any persistence — invalid input
    // exits the flow with a field-specific message rather than being silently
    // coerced (NaN → skipped, or garbage saved).
    let vals: {
      annual_income: number; super_balance: number; investments_value: number;
      cash_balance: number; hecs_balance: number; monthly_expenses: number;
      retirement_age: number;
    };
    try {
      vals = {
        annual_income: parseMoney("Annual income", s.annual_income),
        super_balance: parseMoney("Super balance", s.super_balance),
        investments_value: parseMoney("Investments", s.investments_value),
        cash_balance: parseMoney("Cash & savings", s.cash_balance),
        hecs_balance: parseMoney("HECS / HELP balance", s.hecs_balance),
        monthly_expenses: parseMoney("Monthly expenses", s.monthly_expenses),
        retirement_age: parseRetirementAge(s.retirement_age),
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check the numbers you entered.");
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      // Profile fields (name, age band, risk, retirement age, monthly expenses)
      // → user_profiles via the real endpoint. Asset amounts go to their own
      // tables below, so the merged Maal Score picks them up without double-counting.
      // `onboarded` is deliberately NOT set here — it flips only after every
      // write below succeeds, so a mid-flow failure can't strand the user in
      // an "onboarded" state with missing records.
      // Save the money figures to the profile columns AS WELL AS the asset
      // tables below. The asset rows drive the score once populated, but the
      // profile row is what GET /api/v1/profile returns, so without this the
      // form comes back blank on the next visit and users think their data was
      // lost. patchProfile already accepts every one of these columns.
      const prof = await saveProfile({
        display_name: s.display_name,
        age_band: s.age_band,
        risk: s.risk,
        retirement_age: vals.retirement_age,
        monthly_expenses: vals.monthly_expenses,
        annual_income: vals.annual_income,
        super_balance: vals.super_balance,
        investment_portfolio: vals.investments_value,
        cash_savings: vals.cash_balance,
        hecs_balance: vals.hecs_balance,
      });
      if (!prof) throw new Error("Couldn't save your profile. Check your connection and try again.");

      // Idempotent write: fetch the row onboarding would have created (stable
      // label/kind key) first; UPDATE it when present, INSERT when not — so a
      // retry after a partial failure updates instead of duplicating.
      async function putRecord(
        table: string,
        match: Record<string, string>,
        body: Record<string, unknown>,
        label: string,
      ) {
        let q: any = supabase.from(table).select("id");
        for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
        const found = await q.maybeSingle();
        if (found.error) throw new Error(`Couldn't save your ${label}: ${found.error.message}`);
        const res = found.data?.id != null
          ? await (supabase.from(table) as any).update(body).eq("id", found.data.id)
          : await (supabase.from(table) as any).insert(body);
        if (res.error) throw new Error(`Couldn't save your ${label}: ${res.error.message}`);
      }

      // Deterministic order — each step names itself in the error so the user
      // knows exactly which write failed.
      if (vals.annual_income > 0)
        await putRecord("incomes", { label: "Primary income" },
          { user_id: uid, label: "Primary income", annual_amount: vals.annual_income }, "income");
      if (vals.super_balance > 0)
        await putRecord("super_accounts", { fund_name: "My super" },
          { user_id: uid, fund_name: "My super", balance: vals.super_balance }, "super balance");
      if (vals.investments_value > 0)
        await putRecord("investments", { name: "Portfolio", kind: "etf" },
          { user_id: uid, name: "Portfolio", value: vals.investments_value, kind: "etf" }, "investments");
      if (vals.cash_balance > 0)
        // cash_accounts has account_type (not kind) — matches the assets page.
        await putRecord("cash_accounts", { label: "Savings" },
          { user_id: uid, label: "Savings", balance: vals.cash_balance, account_type: "savings" }, "cash & savings");
      if (vals.hecs_balance > 0)
        await putRecord("debts", { label: "HECS", kind: "hecs" },
          { user_id: uid, label: "HECS", balance: vals.hecs_balance, kind: "hecs" }, "HECS balance");

      // Everything persisted — only now mark onboarding complete.
      const done = await saveProfile({ onboarded: true });
      if (!done) throw new Error("Your details are saved, but onboarding couldn't be marked complete — tap Finish again.");
      toast.success("Onboarding complete");
      navigate({ to: "/app" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // Wait for hydration before rendering the fields, so a returning user never
  // sees empty boxes that then fill in (which reads as "my data was lost").
  if (hydrating) {
    return (
      <div className="max-w-2xl mx-auto px-6 md:px-10 py-12">
        <p className="text-[13px] text-muted-foreground">Loading your details…</p>
      </div>
    );
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