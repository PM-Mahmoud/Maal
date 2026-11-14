// Client for the Home briefs API (routes/briefs.js → /api/v1/briefs).

export type BriefCopy = { title: string; body: string[] };

export type WeeklyRecap = {
  period: { start: string; end: string; label: string; longLabel: string };
  netWorth: {
    hasData: boolean;
    opening: number | null;
    closing: number | null;
    change: number | null;
    changePct: number | null;
    direction: "up" | "down" | "flat";
    series: { date: string; value: number }[];
    copy: BriefCopy;
  };
  spending: {
    hasData: boolean;
    total: number;
    count: number;
    previousTotal: number;
    categories: { group: string; amount: number; share: number }[];
    largest: { amount: number; description: string; group: string; date: string | null } | null;
    copy: BriefCopy;
  };
  cashFlow: { hasData: boolean; moneyIn: number; moneyOut: number; net: number; copy: BriefCopy };
  goals: {
    hasData: boolean;
    count: number;
    reached: number;
    items: { name: string; target: number; current: number; progressPct: number; reached: boolean; targetDate: string | null }[];
    copy: BriefCopy;
  };
};

export type MarketIndex = {
  symbol: string;
  label: string;
  sub: string;
  price: number | null;
  changePercent: number | null;
  series: number[];
};

export type MarketBrief = {
  date: string;
  headline: string;
  story: string[];
  outlook: string;
  lookingAhead: { date: string; title: string; body: string }[];
  indices: MarketIndex[];
  aud: { rate: number; changePercent: number | null; series: number[]; asOf: string } | null;
  sources: { title: string; url: string; source: string }[];
  ai: boolean;
  available: boolean;
  generatedAt: string;
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json() as Promise<T>;
}

// Shape checks: an unexpected payload (e.g. `[]`, or a missing `period`) is
// turned into a query error so the Home cards and stories show their error
// state instead of throwing during render and taking the page down.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isCopy = (v: unknown) => isObj(v) && isStr(v.title) && Array.isArray(v.body);

export function isWeeklyRecap(v: unknown): v is WeeklyRecap {
  if (!isObj(v)) return false;
  const p = v.period;
  if (!isObj(p) || !isStr(p.start) || !isStr(p.label) || !isStr(p.longLabel)) return false;
  const { netWorth: nw, spending: sp, cashFlow: cf, goals: g } = v;
  return (
    isObj(nw) && isCopy(nw.copy) && Array.isArray(nw.series) &&
    isObj(sp) && isCopy(sp.copy) && Array.isArray(sp.categories) &&
    isObj(cf) && isCopy(cf.copy) &&
    isObj(g) && isCopy(g.copy) && Array.isArray(g.items)
  );
}

export function isMarketBrief(v: unknown): v is MarketBrief {
  return (
    isObj(v) && isStr(v.date) && isStr(v.headline) &&
    Array.isArray(v.story) && Array.isArray(v.indices) && Array.isArray(v.sources)
  );
}

export async function getWeeklyRecap(): Promise<WeeklyRecap> {
  const data: unknown = await getJson("/api/v1/briefs/weekly-recap");
  if (!isWeeklyRecap(data)) throw new Error("Unexpected weekly recap response");
  return data;
}

export async function getMarketBrief(): Promise<MarketBrief> {
  const data: unknown = await getJson("/api/v1/briefs/market-brief");
  if (!isMarketBrief(data)) throw new Error("Unexpected market brief response");
  return data;
}

export type BriefKind = "weekly_recap" | "market_brief";

export async function sendBriefFeedback(input: { brief: BriefKind; slide: string; vote: "more" | "less"; period: string }) {
  const r = await fetch("/api/v1/briefs/feedback", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error("Could not save feedback");
}

// React Query keys (shared by HomeBriefCards and the routes).
export const briefKeys = {
  recap: ["briefs", "weekly-recap"] as const,
  market: ["briefs", "market-brief"] as const,
};

export const aud = (n: number, digits?: number) => {
  const abs = Math.abs(n);
  const d = digits ?? (abs < 100 ? 2 : 0);
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

export function relativeUpdated(iso: string | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return mins <= 1 ? "Updated just now" : `Updated ${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  return `Updated ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
}

export const MANDATORY_DISCLAIMER =
  "Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.";
