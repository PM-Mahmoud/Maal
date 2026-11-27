import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { deleteAlert, listAlerts, toggleAlert } from "@/lib/alerts.functions";
import { UsageLimitError } from "@/lib/usage-limit.mjs";
import { DialogFrame } from "./ChatDialogs";

type Watch = { id: string; prompt: string; active: boolean };
type Trigger = { id: string; alert_id: string; message: string; alerted: boolean };
type WatchData = { alerts: Watch[]; events: Trigger[] };

function isWatch(row: unknown): row is Watch {
  if (!row || typeof row !== "object") return false;
  const watch = row as Partial<Watch>;
  return typeof watch.id === "string" && typeof watch.prompt === "string" && typeof watch.active === "boolean";
}

function isTrigger(row: unknown): row is Trigger {
  if (!row || typeof row !== "object") return false;
  const event = row as Partial<Trigger>;
  return event.alerted === true && typeof event.id === "string"
    && typeof event.alert_id === "string" && typeof event.message === "string";
}

export function RadarWatchDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<WatchData | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [limited, setLimited] = useState(false);
  const titleRef = useRef<HTMLParagraphElement>(null);

  async function load() {
    setError("");
    setLimited(false);
    try {
      const result = await listAlerts();
      setData({ alerts: result.alerts.filter(isWatch), events: result.events.filter(isTrigger) });
    } catch {
      setError("Couldn’t load your Radar watches. Please try again.");
    }
  }

  useEffect(() => {
    const formerFocus = document.activeElement;
    titleRef.current?.focus();
    void load();
    return () => { if (formerFocus instanceof HTMLElement) formerFocus.focus(); };
  }, []);

  async function update(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setLimited(false);
    try {
      await action();
      setDeleteId(null);
      await load();
    } catch (error) {
      const result = error instanceof Error ? error : null;
      setError(result?.message || "Couldn’t update that watch. Please try again.");
      setLimited(error instanceof UsageLimitError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame title="Radar watches" onClose={onClose} labelId="mx-adv-radar-title">
      <div className="mx-adv-dialog-body mx-adv-radar-body">
        <p className="mx-adv-dialog-text" ref={titleRef} tabIndex={-1}>
          Ask the Advisor to watch a financial event, such as “Watch the next RBA rate decision for me.”
        </p>
        {!data && !error && <p role="status">Loading watches…</p>}
        {data?.alerts.length === 0 && <p>No Radar watches yet.</p>}
        {!!data?.alerts.length && (
          <ul className="mx-adv-radar-list">
            {data.alerts.map(watch => (
              <li key={watch.id}>
                <div>
                  <p>{watch.prompt}</p>
                  <span className="mx-adv-cite">{watch.active ? "Active" : "Paused"}</span>
                </div>
                <div className="mx-adv-radar-actions">
                  {deleteId === watch.id ? (
                    <>
                      <button type="button" className="mx-adv-text-btn" disabled={busy} onClick={() => setDeleteId(null)}>Cancel</button>
                      <button type="button" className="mx-adv-btn mx-adv-btn--danger" disabled={busy} onClick={() => void update(() => deleteAlert({ id: watch.id }))}>Delete watch</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="mx-adv-text-btn" aria-label={`${watch.active ? "Pause" : "Resume"} ${watch.prompt}`} disabled={busy} onClick={() => void update(() => toggleAlert({ id: watch.id, active: !watch.active }))}>
                        {watch.active ? "Pause" : "Resume"}
                      </button>
                      <button type="button" className="mx-adv-text-btn" aria-label={`Delete ${watch.prompt}`} disabled={busy} onClick={() => setDeleteId(watch.id)}>Delete</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!!data?.events.length && (
          <>
            <h3>Recent alerts</h3>
            <ul className="mx-adv-radar-events">
              {data.events.map(event => {
                const watch = data.alerts.find(watch => watch.id === event.alert_id);
                return <li key={event.id}>{watch && <strong>{watch.prompt}</strong>}<p>{event.message}</p></li>;
              })}
            </ul>
          </>
        )}
        {error && <p className="mx-adv-dialog-error" role="alert">{error}</p>}
        {error && !data && <button type="button" className="mx-adv-text-btn" onClick={() => void load()}>Retry</button>}
        {limited && <Link to="/app/billing" className="mx-adv-text-btn">See plans</Link>}
      </div>
    </DialogFrame>
  );
}
