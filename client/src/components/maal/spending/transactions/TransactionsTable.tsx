import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, EyeOff } from "lucide-react";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import { signedCents } from "@/components/maal/home/format";
import type { CategoryGroup } from "@/lib/transactions-depth.functions";
import { countsAsSpend, isIncome } from "../../../../../../shared/spending-overview.mjs";
import { accountKey, amountOf, dayOf, groupOf, isHidden, isReviewed, type SortKey } from "../../../../../../shared/transactions-list.mjs";
import { openTransactionDetail } from "../transaction-detail/TransactionDetailMount";
import { iconForGroup } from "../overview/categoryIcons";
import { catVars } from "../categoryColour";
import { describeAccount, type AccountInfo, type Txn } from "./useTransactionsData";

const PAGE = 100;

function shortDay(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function longDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The transactions table (HEL-91). Desktop: Merchant, Category, Account, Date,
 * Amount with sortable headers. Phone: each row stacks into a two-line item.
 * Clicking a row opens the Transaction detail drawer (built by the detail part).
 * The category chip is the existing quick re-categorise control.
 */
export function TransactionsTable({
  rows, accounts, groups, sort, onSort, onCategory, query,
}: {
  rows: Txn[];
  accounts: Map<string, AccountInfo>;
  groups: CategoryGroup[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  onCategory: (t: Txn, group: string, category: string) => void;
  query: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const shown = rows.slice(0, limit);

  const head = (key: SortKey | null, label: string, className = "") => {
    if (!key) return <th scope="col" className={className}>{label}</th>;
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th scope="col" className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className="tx-sort" onClick={() => onSort(key)} data-active={active}>
          {label}<Icon aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <>
      <table className="tx-table">
        <caption className="sr-only">Transactions{query ? ` matching “${query}”` : ""}. Select a transaction to see its details.</caption>
        <thead>
          <tr>
            {head("merchant", "Merchant / description", "tx-col-name")}
            {head("category", "Category", "tx-col-cat")}
            {head(null, "Account", "tx-col-acct")}
            {head("date", "Date", "tx-col-date")}
            {head("amount", "Amount", "tx-col-amt")}
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const amt = amountOf(t);
            const group = groupOf(t);
            const hidden = isHidden(t);
            const counted = !hidden && (countsAsSpend(t, undefined) || isIncome(t));
            const acct = describeAccount(accountKey(t), accounts);
            const Icon = iconForGroup(group);
            const name = t.merchant || t.description || "Transaction";
            const open = () => openTransactionDetail(t.id);
            return (
              <tr key={t.id} className="tx-tr" data-muted={!counted} onClick={open}>
                <td className="tx-col-name">
                  <span className="tx-mobile-icon cat-chip" style={catVars(group, groups)} aria-hidden><Icon /></span>
                  <button type="button" className="tx-name-btn" onClick={(e) => { e.stopPropagation(); open(); }}
                    aria-label={`${name}, ${signedCents(amt)}, ${longDate(dayOf(t))}. Open details`}>
                    <span className="tx-name">{name}</span>
                    {isReviewed(t) && <span className="tx-reviewed">Reviewed</span>}
                  </button>
                  <span className="tx-mobile-meta">{shortDay(dayOf(t))} · {acct.label}</span>
                </td>
                <td className="tx-col-cat" onClick={(e) => e.stopPropagation()}>
                  <span className="tx-chip">
                    <span className="tx-chip-icon cat-chip" style={catVars(group, groups)} aria-hidden><Icon /></span>
                    <span className="tx-chip-text">{t.category_group ? (t.category || group) : "Uncategorised"}</span>
                    <ChevronDown className="tx-chip-chev" aria-hidden />
                    <select
                      aria-label={`Change category for ${name}`}
                      value={t.category_group ? JSON.stringify([t.category_group, t.category || ""]) : ""}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [g, c] = JSON.parse(e.target.value) as [string, string];
                        onCategory(t, g, c);
                      }}>
                      {!t.category_group && <option value="">Choose a category…</option>}
                      {t.category_group && !groups.some((g) => g.group === t.category_group && g.categories.includes(t.category || "")) && (
                        <option value={JSON.stringify([t.category_group, t.category || ""])}>{t.category_group}{t.category ? ` · ${t.category}` : ""}</option>
                      )}
                      {groups.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.categories.map((c) => <option key={c} value={JSON.stringify([g.group, c])}>{c}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </span>
                  {t.category_source === "auto" && <span className="tx-src">auto</span>}
                  {t.category_source === "learned" && (
                    <span className="tx-src">suggested {Math.round(Number(t.category_confidence) * 100)}%</span>
                  )}
                </td>
                <td className="tx-col-acct">
                  <span className="tx-acct">
                    {acct.key === "manual"
                      ? <span className="tx-acct-manual" aria-hidden>M</span>
                      : <InstitutionLogo name={acct.institution || acct.label} size={22} />}
                    <span className="tx-acct-label" title={acct.fullName || acct.label}>{acct.label}</span>
                  </span>
                </td>
                <td className="tx-col-date">{longDate(dayOf(t))}</td>
                <td className="tx-col-amt">
                  <span className="tx-amt-wrap">
                    {!counted && <EyeOff className="tx-eye" aria-label={hidden ? "Hidden" : "Not counted in spending"} role="img" />}
                    <span className="tx-amt mh-amount" data-in={amt > 0 && counted}>
                      {amt > 0 ? signedCents(amt) : signedCents(Math.abs(amt)).replace("+", "")}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="tx-more">
          <span className="tx-muted tx-small">Showing {limit.toLocaleString("en-AU")} of {rows.length.toLocaleString("en-AU")}</span>
          <button type="button" className="mh-btn-outline" onClick={() => setLimit((l) => l + PAGE)}>Show more</button>
        </div>
      )}
    </>
  );
}
