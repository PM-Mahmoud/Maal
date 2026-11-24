import { useEffect, useRef, useState } from "react";

const activeMessages = {
  queued: "Bank sync queued. We’ll import your latest transactions shortly.",
  running: "Syncing your bank transactions…",
  retrying: "Your bank is temporarily unavailable. Maal will retry automatically.",
};

const messages = {
  ...activeMessages,
  succeeded: "Bank sync complete. Your transactions are up to date.",
  dead: "Bank sync failed after several attempts. Try syncing again from your accounts.",
  unavailable: "We couldn’t check your bank sync status.",
  timedOut: "Bank sync is taking longer than expected. You can safely leave this page.",
};

type SyncStatus = keyof typeof messages;
const POLL_INTERVAL = 1500;
const MAX_POLLS = 80;

export function BankSyncNotice({ runId, onComplete }: { runId: string; onComplete: () => void }) {
  const [status, setStatus] = useState<SyncStatus>("queued");
  const refreshed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    async function poll() {
      try {
        const response = await fetch(`/api/v1/import-runs/${encodeURIComponent(runId)}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to check import");
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const next = payload?.import_run?.status;
        if (next === "succeeded" || next === "dead") {
          setStatus(next);
          return;
        }
        if (next !== "queued" && next !== "running" && next !== "retrying") {
          throw new Error("Invalid import status");
        }
        if (++attempts >= MAX_POLLS) {
          setStatus("timedOut");
          return;
        }
        setStatus(next);
        timer = setTimeout(poll, POLL_INTERVAL);
      } catch {
        if (!controller.signal.aborted) setStatus("unavailable");
      }
    }

    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [runId]);

  useEffect(() => {
    if (status === "succeeded" && !refreshed.current) {
      refreshed.current = true;
      onComplete();
    }
  }, [status, onComplete]);

  return (
    <p className="tx-toast" data-tone={status === "dead" || status === "unavailable" ? "error" : "ok"} role="status">
      {messages[status]}
    </p>
  );
}
