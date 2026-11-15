// Spending → rules: client for the rule endpoints + display helpers.
// All matching happens server-side in services/transaction-rules.js (the same
// pure matchRule powers preview and apply), so nothing here does money math.

export type MatchType = "contains" | "starts_with" | "equals";
export type Direction = "any" | "debit" | "credit";
export type AmountOp = "eq" | "gt" | "lt";

export type RuleConditions = {
  amount?: { op: AmountOp; value: number };
  categories?: string[];
  date?: { from?: string; to?: string };
};

/** A rule as the server stores it (GET /v1/transaction-rules). */
export type SavedRule = {
  id: number;
  name: string | null;
  match_type: MatchType;
  match_text: string;
  amount_direction: Direction;
  conditions?: RuleConditions | null;
  category_group: string;
  category: string | null;
  priority: number;
};

/** What the create / preview endpoints accept. */
export type RuleInput = {
  match_type: MatchType;
  match_text: string;
  amount_direction: Direction;
  conditions: RuleConditions;
  category_group?: string;
  category?: string;
};

export type MatchItem = {
  id: number;
  description: string;
  amount: number;
  post_date: string | null;
  status: string | null;
  category_group: string | null;
  category: string | null;
};
export type PreviewResult = { total: number; offset: number; limit: number; items: MatchItem[] };

async function errorText(r: Response, fallback: string) {
  const body = await r.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

/** Read-only: which of the signed-in member's transactions this rule would update. */
export async function previewRule(rule: RuleInput, opts: { limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<PreviewResult> {
  const r = await fetch("/api/v1/transaction-rules/preview", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rule, limit: opts.limit ?? 50, offset: opts.offset ?? 0 }),
    signal: opts.signal,
  });
  if (!r.ok) throw new Error(await errorText(r, "Couldn't load matching transactions."));
  return r.json();
}

export async function saveRule(rule: RuleInput): Promise<SavedRule> {
  const r = await fetch("/api/v1/transaction-rules", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!r.ok) throw new Error(await errorText(r, "Couldn't create the rule."));
  const body = await r.json();
  return body.rule as SavedRule;
}

/** Apply one saved rule to its existing matches. Pass exclude_ids OR include_ids. */
export async function applySavedRule(id: number, sel: { exclude_ids?: number[]; include_ids?: number[] }): Promise<number> {
  const r = await fetch(`/api/v1/transaction-rules/${id}/apply`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sel),
  });
  if (!r.ok) throw new Error(await errorText(r, "The rule was saved, but we couldn't update your existing transactions."));
  return (await r.json()).applied ?? 0;
}

// ---------- Display helpers (AUD, AU dates) ----------

const cents = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function audCents(n: number) {
  return cents.format(Number.isFinite(n) ? n : 0);
}
/** "$100" or "$100.50" for rule sentences. */
export function audShort(n: number) {
  return whole.format(Number.isFinite(n) ? n : 0);
}
/** "+$100.00" for money in, "$100.00" for money out (as on the transactions list). */
export function txnAmount(n: number) {
  return n > 0 ? `+${audCents(n)}` : audCents(Math.abs(n));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2 Mar" this year, "2 Mar 2025" otherwise. Parses ISO dates without TZ drift. */
export function auDate(iso: string | null, now = new Date()) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const base = `${d} ${MONTHS[mo - 1]}`;
  return y === now.getFullYear() ? base : `${base} ${y}`;
}

const AMOUNT_WORDS: Record<AmountOp, string> = { eq: "equal to", gt: "greater than", lt: "less than" };
export const AMOUNT_LABELS: Record<AmountOp, string> = { eq: "Equal to", gt: "Greater than", lt: "Less than" };
export const MATCH_LABELS: Record<MatchType, string> = { contains: "Contains", starts_with: "Starts with", equals: "Is exactly" };
export const DIRECTION_LABELS: Record<Direction, string> = { any: "Money in or out", debit: "Money out", credit: "Money in" };

type Describable = {
  match_type: MatchType | string;
  match_text: string;
  amount_direction: Direction;
  conditions?: RuleConditions | null;
};

/** Each condition as a short clause, e.g. ["amount is greater than $100", "merchant contains “Opal”"]. */
export function conditionClauses(rule: Describable): string[] {
  const out: string[] = [];
  const c = rule.conditions || {};
  if (rule.match_text?.trim()) {
    const verb = rule.match_type === "equals" ? "is" : rule.match_type === "starts_with" ? "starts with" : "contains";
    out.push(`merchant ${verb} “${rule.match_text.trim()}”`);
  }
  if (c.amount) out.push(`amount is ${AMOUNT_WORDS[c.amount.op]} ${audShort(c.amount.value)}`);
  if (c.categories?.length) {
    out.push(c.categories.length === 1 ? `category is ${c.categories[0]}` : `category is one of ${c.categories.length} categories`);
  }
  if (c.date?.from && c.date?.to) out.push(`date is ${fullDate(c.date.from)} – ${fullDate(c.date.to)}`);
  else if (c.date?.from) out.push(`date is on or after ${fullDate(c.date.from)}`);
  else if (c.date?.to) out.push(`date is on or before ${fullDate(c.date.to)}`);
  if (rule.amount_direction === "debit") out.push("it's money out");
  if (rule.amount_direction === "credit") out.push("it's money in");
  return out;
}

/** "If amount is greater than $100 and merchant contains “Opal”" — used by the rules list too. */
export function describeRule(rule: Describable): string {
  const clauses = conditionClauses(rule);
  if (!clauses.length) return "No conditions yet";
  return `If ${clauses.join(" and ")}`;
}

/** "Set category to Auto & Transport · Public transport" */
export function describeUpdate(rule: { category_group?: string | null; category?: string | null }) {
  if (!rule.category_group) return "";
  return `Set category to ${rule.category_group}${rule.category ? ` · ${rule.category}` : ""}`;
}

/** "16 Nov 2026" */
export function fullDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}
