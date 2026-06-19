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
