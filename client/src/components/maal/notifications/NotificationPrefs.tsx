import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Mail, Radar } from "lucide-react";
import { getNotificationPrefs, setNotificationPref } from "@/lib/notification-prefs.functions";

/**
 * Only the notifications Maal actually sends are offered here:
 *  - the daily portfolio summary email (users.notification_prefs.daily_digest,
 *    honoured by services/digest.js), and
 *  - radar alerts, whose email/SMS channels are chosen per radar.
 */
export function NotificationPrefs() {
  const [digest, setDigest] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getNotificationPrefs()
      .then((p) => setDigest(p.daily_digest))
      .catch(() => setDigest(false));
  }, []);

  async function toggleDigest() {
    if (digest === null || saving) return;
    const next = !digest;
    setDigest(next);
    setSaving(true);
    setStatus("");
    let ok = false;
    try { ok = await setNotificationPref("daily_digest", next); } catch { ok = false; }
    setSaving(false);
    if (!ok) {
      setDigest(!next);
      setStatus("Couldn’t save that change. Please try again.");
    } else {
      setStatus(next ? "Daily summary on. It arrives by email each morning." : "Daily summary off.");
    }
  }

  return (
    <>
      <ul className="mt-rows">
        <li>
          <div className="mt-row">
            <Mail className="mt-row-icon" aria-hidden />
            <span className="mt-row-text" id="mt-digest-label">
              Daily portfolio summary
              <span className="mt-row-sub">A morning email with your net worth and Maal Score.</span>
            </span>
            <button
              type="button"
              role="switch"
              className="mt-switch"
              aria-checked={!!digest}
              aria-labelledby="mt-digest-label"
              disabled={digest === null || saving}
              onClick={toggleDigest}
            />
          </div>
        </li>
        <li>
          <Link to="/app/radar" className="mt-row">
            <Radar className="mt-row-icon" aria-hidden />
            <span className="mt-row-text">
              Radar alerts
              <span className="mt-row-sub">Choose email or SMS for each radar you set up.</span>
            </span>
            <span className="mt-row-end"><ChevronRight aria-hidden /></span>
          </Link>
        </li>
      </ul>
      <p className="mt-status" role="status" aria-live="polite">{status}</p>
    </>
  );
}
