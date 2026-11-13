import { useEffect, useState } from "react";

// Whether signups are invite-only right now (server: WAITLIST_GATE, see
// lib/waitlist-gate.js). Defaults to true so the header never flashes
// "Sign up" before the status call returns while the gate is on.
export function useWaitlistGated(): boolean {
  const [gated, setGated] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/waitlist/status", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && typeof d.gated === "boolean") setGated(d.gated); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return gated;
}

export function signupLink(gated: boolean): { href: string; label: string } {
  return gated ? { href: "/waitlist", label: "Join waitlist" } : { href: "/signup", label: "Sign up" };
}
