// Settings (redesign S5): typed calls for the profile form, SMS-verified phone
// change and account deletion. Server side: PATCH /api/v1/profile
// (lib/profile-details.js), /api/account/phone/*, POST /api/account/delete.
import { handleUnauthenticated } from "@/integrations/api";

export type AuAddress = { line1: string; suburb: string; state: string; postcode: string };

export type SettingsProfile = {
  display_name: string;
  legal_name: string | null;
  date_of_birth: string | null;
  address: AuAddress | null;
  employment_status: string | null;
  tax_residency: string | null;
  dependants: number | null;
  annual_income: number;
  email: string | null;
  phone: string | null;
};

export type ProfilePatch = Partial<{
  legal_name: string;
  date_of_birth: string;
  address: AuAddress | null;
  employment_status: string;
  tax_residency: string;
  dependants: number | "";
  annual_income: number;
}>;

export const AU_STATES: { value: string; label: string }[] = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
];

export const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "full_time", label: "Full-time employee" },
  { value: "part_time", label: "Part-time employee" },
  { value: "casual", label: "Casual employee" },
  { value: "self_employed", label: "Self-employed / sole trader" },
  { value: "contractor", label: "Contractor" },
  { value: "unemployed", label: "Not currently working" },
  { value: "retired", label: "Retired" },
  { value: "student", label: "Student" },
  { value: "home_duties", label: "Home duties / carer" },
];

export const TAX_RESIDENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "resident", label: "Australian resident for tax purposes" },
  { value: "foreign_resident", label: "Foreign resident" },
  { value: "working_holiday_maker", label: "Working holiday maker" },
];

export const PHONE_COUNTRIES: { value: string; dial: string; label: string; flag: string }[] = [
  { value: "AU", dial: "+61", label: "Australia", flag: "🇦🇺" },
  { value: "NZ", dial: "+64", label: "New Zealand", flag: "🇳🇿" },
  { value: "GB", dial: "+44", label: "United Kingdom", flag: "🇬🇧" },
  { value: "US", dial: "+1", label: "United States", flag: "🇺🇸" },
];

/** Split a stored E.164 number back into the country picker + local number. */
export function splitPhone(e164: string | null): { country: string; number: string } {
  if (!e164) return { country: "AU", number: "" };
  const match = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => e164.startsWith(c.dial));
  if (!match) return { country: "AU", number: e164 };
  let local = e164.slice(match.dial.length);
  if (match.value === "AU" && /^4\d{8}$/.test(local)) local = `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return { country: match.value, number: local };
}

export class ApiError extends Error {
  fields?: Record<string, string>;
  retryAfter?: number;
  constructor(message: string, fields?: Record<string, string>, retryAfter?: number) {
    super(message);
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("You seem to be offline. Check your connection and try again.");
  }
  if (r.status === 401) {
    handleUnauthenticated();
    throw new ApiError("Your session has expired. Please sign in again.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(j?.error || "Something went wrong. Please try again.", j?.fields, j?.retryAfter);
  return j as T;
}

export const getSettingsProfile = () => call<SettingsProfile>("/api/v1/profile", "GET");
export const patchSettingsProfile = (patch: ProfilePatch) => call<SettingsProfile>("/api/v1/profile", "PATCH", patch);
export const sendPhoneCode = (country: string, number: string) =>
  call<{ ok: true; phone: string; resendIn: number }>("/api/account/phone/send-code", "POST", { country, number });
export const verifyPhoneCode = (code: string) =>
  call<{ ok: true; phone: string }>("/api/account/phone/verify", "POST", { code });
export const DELETE_CONFIRMATION = "DELETE MY ACCOUNT";
export const deleteAccount = (confirmation: string) =>
  call<{ ok: true }>("/api/account/delete", "POST", { confirmation });
