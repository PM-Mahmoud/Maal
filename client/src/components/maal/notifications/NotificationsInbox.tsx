import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listNotifications, markNotificationsRead, NOTIFICATIONS_READ_EVENT } from "@/lib/notifications.functions";
import { relativeTime, safeInternalLink } from "./format";

type Notice = {
  id: number | string;
  type?: string;
  title: string;
  body?: string | null;
  data?: unknown;
  link?: string;
  read_at?: string | null;
  created_at: string;
};

/**
 * The notification inbox: real rows from the `notifications` table (alerts and
 * automation-rule notices Maal raises for this user), newest first. Opening the
 * list marks what's shown as read; unread dots stay visible for this view.
 */
export function NotificationsInbox() {
  const [items, setItems] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setItems(null);
    try {
      const rows = (await listNotifications()) as Notice[];
      setItems(rows);
      const unread = rows.filter((n) => !n.read_at).map((n) => n.id);
      if (unread.length) {
        markNotificationsRead(unread)
          .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT)))
          .catch(() => { /* best effort */ });
      }
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (failed) {
    return (
      <div className="mt-error" role="alert">
        <span>We couldn’t load your notifications.</span>
        <button type="button" className="mh-btn-outline" onClick={load}>Try again</button>
      </div>
    );
  }

  if (items === null) {
    return (
      <div aria-busy="true" aria-label="Loading notifications">
        {[0, 1, 2].map((i) => (
          <div className="mt-skel" key={i}>
            <span style={{ width: "46%" }} />
            <span style={{ width: "78%" }} />
            <span style={{ width: "28%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-empty">
        <p className="mt-empty-title">You’re all caught up</p>
        <p className="mt-empty-text">
          Alerts from your radars and any automations you set up will show here.
          Your weekly recap and daily market brief are always on Home.
        </p>
        <div className="mt-empty-links">
          <Link to="/app/recap" className="mh-btn-outline">Weekly recap</Link>
          <Link to="/app/market-brief" className="mh-btn-outline">Daily market brief</Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="mt-list">
      {items.map((n) => {
        const href = safeInternalLink(n);
        const inner = (
          <>
            {!n.read_at && <span className="mt-unread" aria-label="Unread" />}
            <p className="mt-item-title">{n.title}</p>
            {n.body && <p className="mt-item-body">{n.body}</p>}
            <p className="mt-item-time">
              <time dateTime={n.created_at}>{relativeTime(n.created_at)}</time>
            </p>
          </>
        );
        return (
          <li className="mt-item" key={n.id}>
            {href ? <a className="mt-item-link" href={href}>{inner}</a> : <div className="mt-item-link">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
