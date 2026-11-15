import { useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { supabase } from "@/integrations/api";

// Figma "Logging out": the Logout row → the sign-in page.
// POST /api/auth/logout destroys the session server-side and clears the
// cookie; then a full page load to the server-rendered /login, which shows a
// "You've been logged out" notice. Any account menu (e.g. the Settings menu)
// can drop in <LogoutRow/>; the shell uses it in the phone drawer and
// <LogoutIconButton/> in the sidebar footer.

export const SIGNED_OUT_URL = "/login?signed_out=1";

export function useLogout() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    if (err) {
      setPending(false);
      setError("We couldn't log you out. Check your connection and try again.");
      return;
    }
    window.location.assign(SIGNED_OUT_URL);
  }
  return { logout, pending, error };
}

/** Full-width settings-style row: logout icon, "Log out" in red, chevron. */
export function LogoutRow({ className = "", onBeforeLogout }: { className?: string; onBeforeLogout?: () => void }) {
  const { logout, pending, error } = useLogout();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => { onBeforeLogout?.(); void logout(); }}
        disabled={pending}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--mh-line)] bg-[var(--mh-card)] px-4 py-3.5 text-[15px] text-[var(--mh-bad)] hover:bg-[var(--mh-hover)] disabled:cursor-wait disabled:opacity-60"
      >
        <LogOut aria-hidden className="size-[18px] shrink-0" />
        <span className="flex-1 text-left">{pending ? "Logging out…" : "Log out"}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--mh-muted)]" />
      </button>
      {error && <p role="alert" className="mt-2 px-1 text-[12.5px] text-[var(--mh-bad)]">{error}</p>}
    </div>
  );
}

/** Compact round icon button for the sidebar footer. */
export function LogoutIconButton() {
  const { logout, pending, error } = useLogout();
  const label = error ?? (pending ? "Logging out…" : "Log out");
  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={pending}
      aria-label={label}
      title={label}
      className={`grid size-7 place-items-center rounded-full hover:bg-[var(--mh-chip)] ${error ? "text-[var(--mh-bad)]" : "text-[var(--mh-muted)] hover:text-[var(--mh-bad)]"}`}
    >
      <LogOut className="size-3.5" aria-hidden />
    </button>
  );
}
