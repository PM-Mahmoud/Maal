import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import {
  ApiError, AU_STATES, EMPLOYMENT_OPTIONS, PHONE_COUNTRIES, TAX_RESIDENCY_OPTIONS,
  getSettingsProfile, patchSettingsProfile, sendPhoneCode, splitPhone,
  type ProfilePatch, type SettingsProfile,
} from "@/components/maal/settings/api";
import { Field, SectionRule, SettingsToast } from "@/components/maal/settings/parts";
import { PhoneVerifyDialog } from "@/components/maal/settings/PhoneVerifyDialog";

// "Updating profile from Settings" flow: initial → changes entered → saved
// (toast) → phone verification (code sent → code entered) → phone updated.
// Details persist through PATCH /api/v1/profile (validated server-side in
// lib/profile-details.js); the phone only changes after SMS verification.
export const Route = createFileRoute("/_authenticated/app/settings/profile")({
  head: () => ({ meta: [{ title: "Profile · Settings · Maal" }] }),
  component: ProfileSettings,
});

type Form = {
  legal_name: string;
  date_of_birth: string;
  country: string;
  number: string;
  line1: string;
  suburb: string;
  state: string;
  postcode: string;
  employment_status: string;
  annual_income: string;
  tax_residency: string;
  dependants: number;
};

const MAX_DEPENDANTS = 20;

function toForm(p: SettingsProfile): Form {
  const { country, number } = splitPhone(p.phone);
  return {
    legal_name: p.legal_name ?? "",
    date_of_birth: p.date_of_birth ?? "",
    country,
    number,
    line1: p.address?.line1 ?? "",
    suburb: p.address?.suburb ?? "",
    state: p.address?.state ?? "",
    postcode: p.address?.postcode ?? "",
    employment_status: p.employment_status ?? "",
    annual_income: p.annual_income ? String(Math.round(p.annual_income)) : "",
    tax_residency: p.tax_residency ?? "",
    dependants: p.dependants ?? 0,
  };
}

const fmtIncome = (raw: string) => (raw ? Number(raw).toLocaleString("en-AU") : "");
const digitsOnly = (s: string) => s.replace(/\D/g, "");
const phoneKey = (country: string, number: string) => `${country}:${digitsOnly(number).replace(/^0/, "")}`;

/** Only the detail fields that changed, in API shape. */
function buildPatch(form: Form, base: Form): ProfilePatch {
  const patch: ProfilePatch = {};
  if (form.legal_name !== base.legal_name) patch.legal_name = form.legal_name;
  if (form.date_of_birth !== base.date_of_birth) patch.date_of_birth = form.date_of_birth;
  if (form.line1 !== base.line1 || form.suburb !== base.suburb || form.state !== base.state || form.postcode !== base.postcode) {
    const any = [form.line1, form.suburb, form.state, form.postcode].some((v) => v.trim());
    patch.address = any ? { line1: form.line1, suburb: form.suburb, state: form.state, postcode: form.postcode } : null;
  }
  if (form.employment_status !== base.employment_status) patch.employment_status = form.employment_status;
  if (form.annual_income !== base.annual_income) patch.annual_income = Number(form.annual_income || 0);
  if (form.tax_residency !== base.tax_residency) patch.tax_residency = form.tax_residency;
  if (form.dependants !== base.dependants) patch.dependants = form.dependants;
  return patch;
}

function ProfileSettings() {
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [base, setBase] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ phone: string; resendIn: number } | null>(null);
  const [phoneJustVerified, setPhoneJustVerified] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const p = await getSettingsProfile();
      setProfile(p);
      const f = toForm(p);
      setBase(f);
      setForm(f);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your profile.");
    }
  }
  useEffect(() => { void load(); }, []);

  const patch = useMemo(() => (form && base ? buildPatch(form, base) : {}), [form, base]);
  const phoneChanged = !!form && !!base && digitsOnly(form.number) !== "" && phoneKey(form.country, form.number) !== phoneKey(base.country, base.number);
  const dirty = Object.keys(patch).length > 0 || phoneChanged;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => {
      const errKey = ["line1", "suburb", "state", "postcode"].includes(key) ? "address" : ["country", "number"].includes(key) ? "phone" : key;
      if (!e[errKey]) return e;
      const { [errKey]: _drop, ...rest } = e;
      return rest;
    });
    if (key === "country" || key === "number") setPhoneJustVerified(false);
  };

  async function save() {
    if (!form || !base || saving) return;
    setSaving(true);
    setErrors({});
    try {
      if (Object.keys(patch).length) {
        const updated = await patchSettingsProfile(patch);
        setProfile(updated);
        // The stored phone stays the baseline until the new one is verified.
        const fresh = toForm(updated);
        setBase(fresh);
        setForm((f) => (f ? { ...fresh, country: f.country, number: f.number } : f));
        setToast("Profile updated.");
      }
      if (phoneChanged) {
        try {
          const r = await sendPhoneCode(form.country, form.number);
          setVerify({ phone: r.phone, resendIn: r.resendIn });
        } catch (e) {
          setErrors((prev) => ({ ...prev, phone: e instanceof Error ? e.message : "Could not send a code." }));
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      else setErrors({ form: e instanceof Error ? e.message : "Could not save your profile." });
    } finally {
      setSaving(false);
    }
  }

  function onPhoneVerified(phone: string) {
    setVerify(null);
    setProfile((p) => (p ? { ...p, phone } : p));
    const parts = splitPhone(phone);
    setBase((b) => (b ? { ...b, ...parts } : b));
    setForm((f) => (f ? { ...f, ...parts } : f));
    setPhoneJustVerified(true);
    setToast("Phone number updated.");
  }

  if (loadError) {
    return (
      <div className="ms-alert" role="alert">
        {loadError}
        <button type="button" className="mh-link-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!form || !profile) {
    return (
      <div className="mh-card" aria-busy="true" aria-label="Loading your profile">
        <div className="mh-card-head"><span className="mh-card-label">Personal information</span></div>
        <div className="mh-card-body ms-grid2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ms-skeleton" />)}
        </div>
      </div>
    );
  }

  const country = PHONE_COUNTRIES.find((c) => c.value === form.country) ?? PHONE_COUNTRIES[0];

  return (
    <>
      <form
        className="ms-body"
        style={{ marginTop: 0 }}
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        noValidate
      >
        {/* ── Personal information ─────────────────────────────── */}
        <section className="mh-card" aria-labelledby="ms-personal">
          <div className="mh-card-head"><h2 id="ms-personal" className="mh-card-label">Personal information</h2></div>
          <div className="mh-card-body">
            <div className="ms-grid2">
              <div>
                <Field id="ms-legal-name" label="Full legal name" filled={!!form.legal_name} invalid={!!errors.legal_name}>
                  <input id="ms-legal-name" className="ms-input" autoComplete="name" value={form.legal_name}
                    placeholder="Mahmoud Abumarzouq" onChange={(e) => set("legal_name", e.target.value)} maxLength={120} />
                </Field>
                {errors.legal_name && <p className="ms-err">{errors.legal_name}</p>}
              </div>
              <div>
                <Field id="ms-dob" label="Date of birth" filled={!!form.date_of_birth} invalid={!!errors.date_of_birth}>
                  <input id="ms-dob" className="ms-input" type="date" autoComplete="bday" value={form.date_of_birth}
                    max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("date_of_birth", e.target.value)}
                    aria-describedby={errors.date_of_birth ? "ms-dob-err" : undefined} />
                </Field>
                {errors.date_of_birth && <p id="ms-dob-err" className="ms-err">{errors.date_of_birth}</p>}
              </div>
            </div>

            <div className="ms-grid2" style={{ marginTop: 6 }}>
              <div>
                <SectionRule>Phone</SectionRule>
                <div className="ms-row ms-row--phone">
                  <Field id="ms-country" label="Country" filled select>
                    <select id="ms-country" className="ms-input" value={form.country} onChange={(e) => set("country", e.target.value)}
                      aria-label="Country calling code">
                      {PHONE_COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.flag} {c.dial}</option>)}
                    </select>
                  </Field>
                  <Field id="ms-phone" label="Mobile number" filled={!!form.number} invalid={!!errors.phone}>
                    <input id="ms-phone" className="ms-input" type="tel" inputMode="tel" autoComplete="tel-national"
                      placeholder={country.value === "AU" ? "0412 345 678" : ""} value={form.number}
                      onChange={(e) => set("number", e.target.value)} maxLength={20}
                      aria-describedby="ms-phone-help" />
                  </Field>
                </div>
                {errors.phone
                  ? <p className="ms-err" id="ms-phone-help" role="alert">{errors.phone}</p>
                  : phoneJustVerified
                    ? <p className="ms-verified" id="ms-phone-help"><CheckCircle2 className="size-4" aria-hidden /> Verified</p>
                    : <p className="ms-hint" id="ms-phone-help">{phoneChanged ? "We'll text you a code to confirm this number when you save." : "Used for sign-in codes and alerts."}</p>}
              </div>
              <div>
                <SectionRule>Address</SectionRule>
                <div className="ms-stack">
                  <Field id="ms-line1" label="Street address" filled={!!form.line1} invalid={!!errors.address}>
                    <input id="ms-line1" className="ms-input" autoComplete="address-line1" value={form.line1}
                      onChange={(e) => set("line1", e.target.value)} maxLength={120} />
                  </Field>
                  <div className="ms-row ms-row--addr">
                    <Field id="ms-suburb" label="Suburb" filled={!!form.suburb} invalid={!!errors.address}>
                      <input id="ms-suburb" className="ms-input" autoComplete="address-level2" value={form.suburb}
                        onChange={(e) => set("suburb", e.target.value)} maxLength={60} />
                    </Field>
                    <Field id="ms-state" label="State" filled={!!form.state} invalid={!!errors.address} select>
                      <select id="ms-state" className="ms-input" autoComplete="address-level1" value={form.state}
                        onChange={(e) => set("state", e.target.value)}>
                        <option value="" disabled hidden />
                        {AU_STATES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
                      </select>
                    </Field>
                    <Field id="ms-postcode" label="Postcode" filled={!!form.postcode} invalid={!!errors.address}>
                      <input id="ms-postcode" className="ms-input" inputMode="numeric" autoComplete="postal-code"
                        value={form.postcode} onChange={(e) => set("postcode", digitsOnly(e.target.value).slice(0, 4))} />
                    </Field>
                  </div>
                </div>
                {errors.address && <p className="ms-err" role="alert">{errors.address}</p>}
              </div>
            </div>

            <SectionRule>Email</SectionRule>
            <Field id="ms-email" label="Email" filled={!!profile.email} readOnly>
              <input id="ms-email" className="ms-input" type="email" value={profile.email ?? ""} readOnly aria-describedby="ms-email-help" />
            </Field>
            <p className="ms-hint" id="ms-email-help">To change the email you sign in with, contact support.</p>
          </div>
        </section>

        {/* ── Tax and income ───────────────────────────────────── */}
        <section className="mh-card" aria-labelledby="ms-tax">
          <div className="mh-card-head"><h2 id="ms-tax" className="mh-card-label">Tax and income details</h2></div>
          <div className="mh-card-body">
            <div className="ms-grid2">
              <div>
                <Field id="ms-employment" label="Employment status" filled={!!form.employment_status} invalid={!!errors.employment_status} select>
                  <select id="ms-employment" className="ms-input" value={form.employment_status}
                    onChange={(e) => set("employment_status", e.target.value)}>
                    <option value="" disabled hidden />
                    {EMPLOYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                {errors.employment_status && <p className="ms-err">{errors.employment_status}</p>}
              </div>
              <div>
                <Field id="ms-income" label="Annual gross income (before tax)" filled={!!form.annual_income}>
                  <span className="ms-prefix" aria-hidden>$</span>
                  <input id="ms-income" className="ms-input ms-input--prefixed" inputMode="numeric"
                    value={fmtIncome(form.annual_income)}
                    onChange={(e) => set("annual_income", digitsOnly(e.target.value).slice(0, 9))} />
                </Field>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field id="ms-residency" label="Tax residency" filled={!!form.tax_residency} invalid={!!errors.tax_residency} select>
                <select id="ms-residency" className="ms-input" value={form.tax_residency}
                  onChange={(e) => set("tax_residency", e.target.value)}>
                  <option value="" disabled hidden />
                  {TAX_RESIDENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {errors.tax_residency && <p className="ms-err">{errors.tax_residency}</p>}
            </div>

            <SectionRule>Dependants</SectionRule>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-[15px]" id="ms-dependants-label">
                Children or others who rely on you financially
              </p>
              <div className="ms-stepper" role="group" aria-labelledby="ms-dependants-label">
                <button type="button" aria-label="Fewer dependants" disabled={form.dependants <= 0}
                  onClick={() => set("dependants", Math.max(0, form.dependants - 1))}><Minus className="size-4" /></button>
                <output aria-live="polite">{form.dependants}</output>
                <button type="button" aria-label="More dependants" disabled={form.dependants >= MAX_DEPENDANTS}
                  onClick={() => set("dependants", Math.min(MAX_DEPENDANTS, form.dependants + 1))}><Plus className="size-4" /></button>
              </div>
            </div>
            {errors.dependants && <p className="ms-err">{errors.dependants}</p>}
          </div>
        </section>

        {errors.form && <div className="ms-alert" role="alert">{errors.form}</div>}

        <div className="ms-save">
          <button type="submit" className="mh-btn-ink" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {verify && (
        <PhoneVerifyDialog
          phoneDisplay={verify.phone}
          country={form.country}
          number={form.number}
          resendIn={verify.resendIn}
          onVerified={onPhoneVerified}
          onClose={() => setVerify(null)}
        />
      )}
      {toast && <SettingsToast title={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
