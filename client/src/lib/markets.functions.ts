export async function getMarketIndices() {
  const r = await fetch("/api/v1/markets/indices", { credentials: "include" });
  if (!r.ok) throw new Error("Could not load market indices");
  return r.json();
}
export async function getMarketNews() {
  const r = await fetch("/api/v1/markets/news", { credentials: "include" });
  if (!r.ok) throw new Error("Could not load market news");
  return r.json();
}
export async function getUpcomingEarnings() {
  const r = await fetch("/api/v1/markets/earnings", { credentials: "include" });
  if (!r.ok) throw new Error("Could not load earnings");
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
