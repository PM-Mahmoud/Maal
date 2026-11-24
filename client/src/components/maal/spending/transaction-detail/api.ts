// Client for the "Session 2 – Transaction detail" block in routes/api.js
// (HEL-96..103). Every call throws an Error with the server's message on
// failure so the drawer can show it — never a silent $0 or empty state.
import { setCustomColours } from "../categoryColour";

export type Tag = { id: string; name: string; color: string; uses?: number };
export type Split = { id?: string; amount: number; category_group: string; category: string | null; hidden: boolean };
export type TxnDetail = {
  id: string | number;
  description?: string | null;
  amount: number | string;
  status?: string | null;
  post_date?: string | null;
  category_group?: string | null;
  category?: string | null;
  category_source?: string | null;
  account_reference?: string | null;
  institution_name?: string | null;
  manual_account_label?: string | null;
  hidden: boolean;
  reviewed: boolean;
  reviewed_at?: string | null;
  note: string | null;
  merchant_name: string | null;
  description_override: string | null;
  merchant?: string;
  tags: Tag[];
  splits: Split[];
};
// Custom categories also carry custom/color (lib/spending-categories.js mergeTaxonomy).
export type CategoryGroup = { group: string; categories: string[]; custom?: boolean; color?: string };

/** What the "Editing transactions" drawer can change in one go. */
export type BulkChanges = {
  category?: { category_group: string; category: string | null } | null;
  hidden?: boolean;
  reviewed?: boolean;
  merchant_name?: string | null;
  description?: string | null;
  add_tag_ids?: string[];
  set_tag_ids?: string[];
};

async function json<T>(r: Response, fallback: string): Promise<T> {
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) throw new Error("Your session has expired — sign in again.");
    throw new Error((body && body.error) || fallback);
  }
  return body as T;
}
const send = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const enc = (id: string | number) => encodeURIComponent(String(id));

export async function getTransactionDetail(id: string | number): Promise<TxnDetail> {
  const r = await fetch(`/api/v1/transactions/${enc(id)}/detail`, { credentials: "include" });
  return (await json<{ transaction: TxnDetail }>(r, "Couldn't load this transaction.")).transaction;
}

export async function patchMeta(id: string | number, patch: { hidden?: boolean; reviewed?: boolean; note?: string | null; merchant_name?: string | null; description?: string | null }) {
  const r = await fetch(`/api/v1/transactions/${enc(id)}/meta`, send("PATCH", patch));
  await json(r, "Couldn't save that change.");
}

/** Reuses the existing PATCH /v1/transactions/:id/category (manual category + learning). */
export async function setCategory(id: string | number, category_group: string, category: string | null) {
  const r = await fetch(`/api/v1/transactions/${enc(id)}/category`, send("PATCH", { category_group, category: category || undefined }));
  await json(r, "Couldn't update the category.");
}

export async function setTags(id: string | number, tagIds: string[]) {
  const r = await fetch(`/api/v1/transactions/${enc(id)}/tags`, send("PUT", { tag_ids: tagIds }));
  await json(r, "Couldn't save tags.");
}

export async function putSplits(id: string | number, splits: Split[]) {
  const r = await fetch(`/api/v1/transactions/${enc(id)}/splits`, send("PUT", { splits }));
  return (await json<{ splits: Split[] }>(r, "Couldn't save the split.")).splits;
}

export async function removeSplits(id: string | number) {
  const r = await fetch(`/api/v1/transactions/${enc(id)}/splits`, send("DELETE"));
  await json(r, "Couldn't remove the split.");
}

export async function bulkEdit(ids: Array<string | number>, changes: BulkChanges): Promise<number> {
  const r = await fetch("/api/v1/transactions/bulk-edit", send("POST", { ids, changes }));
  return (await json<{ updated: number }>(r, "Couldn't update those transactions.")).updated;
}

export async function listTags(): Promise<Tag[]> {
  const r = await fetch("/api/v1/tags", { credentials: "include" });
  return (await json<{ tags: Tag[] }>(r, "Couldn't load your tags.")).tags;
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const r = await fetch("/api/v1/tags", send("POST", { name, color }));
  return (await json<{ tag: Tag }>(r, "Couldn't create the tag.")).tag;
}

export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  const r = await fetch("/api/v1/transaction-categories", { credentials: "include" });
  const body = await json<{ groups?: CategoryGroup[] }>(r, "Couldn't load categories.");
  const groups = Array.isArray(body?.groups) ? body.groups : [];
  setCustomColours(groups); // custom categories' stored colours for every Spending view
  return groups;
}
