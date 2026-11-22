// Session 2 contract stub (coordinator). The Transaction detail & editing part
// (HEL-96..103) replaces this with the real drawer. Any page that lists
// transactions mounts <TransactionDetailMount /> once and opens a transaction by
// calling openTransactionDetail(id) (it sets ?txn=<id> on the current URL).
// The drawer reads ?txn, shows the transaction, and calls onChanged() after an
// edit so the page can refetch.

export function openTransactionDetail(id: string | number): void {
  const url = new URL(window.location.href);
  url.searchParams.set("txn", String(id));
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function TransactionDetailMount(_props: { onChanged?: () => void }) {
  return null;
}
