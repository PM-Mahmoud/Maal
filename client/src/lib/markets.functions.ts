export async function getMarketIndices() {
  const r = await fetch("/api/v1/markets/indices", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}
export async function getMarketNews() {
  const r = await fetch("/api/v1/markets/news", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}
export async function getUpcomingEarnings() {
  const r = await fetch("/api/v1/markets/earnings", { credentials: "include" });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
