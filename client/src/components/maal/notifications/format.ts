/** "just now", "5 minutes ago", "about 11 hours ago", "3 days ago", then "16 Nov 2026". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Only follow in-app paths a notification carries (never an off-site URL). */
export function safeInternalLink(n: { link?: unknown; data?: unknown }): string | null {
  const data = (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
  const raw = [n.link, data.link, data.url, data.href].find((v) => typeof v === "string") as string | undefined;
  if (!raw) return null;
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : null;
}
