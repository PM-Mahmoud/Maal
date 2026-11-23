// Session 2 contract (HEL-96..103). Any page that lists transactions mounts
// <TransactionDetailMount /> once and opens a transaction by calling
// openTransactionDetail(id) (it sets ?txn=<id> on the current URL). The drawer
// reads ?txn (and follows back/forward via popstate), shows the transaction,
// and calls onChanged() after every edit so the page can refetch. Closing it
// removes ?txn.
import { useCallback, useEffect, useState } from "react";
import { TransactionDetailDrawer } from "./DetailDrawer";

export { TransactionEditDrawer } from "./DetailDrawer";
export type { EditableRow } from "./EditFlow";

const PARAM = "txn";

export function openTransactionDetail(id: string | number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, String(id));
  window.history.pushState(window.history.state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function readTxnParam(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URL(window.location.href).searchParams.get(PARAM);
  return v && v.trim() ? v.trim() : null;
}

export function TransactionDetailMount({ onChanged }: { onChanged?: () => void }) {
  const [id, setId] = useState<string | null>(readTxnParam);

  useEffect(() => {
    const sync = () => setId(readTxnParam());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const close = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM);
    // Replace rather than push so Back doesn't reopen the drawer it just closed.
    window.history.replaceState(window.history.state, "", url);
    setId(null);
  }, []);

  if (!id) return null;
  return <TransactionDetailDrawer key={id} id={id} onClose={close} onChanged={onChanged} />;
}
