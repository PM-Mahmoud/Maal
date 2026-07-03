import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/api";

export function SiteHeader() {
  const [authed, setAuthed] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <header className="sticky top-[3px] z-40 bg-[var(--background)]/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link to="/" className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--mint)]" />
            <span className="text-[17px] font-bold tracking-display">Maal</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[13px] text-muted-foreground">
            <Link to="/score" className="hover:text-foreground transition-colors">Score Calculator</Link>
            <a href="/#how" className="hover:text-foreground transition-colors">How it Works</a>
            <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/waitlist" className="hover:text-foreground transition-colors">Waitlist</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {authed ? (
            <>
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
              <Link
                to="/app"
                className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[13px] font-semibold hover:bg-foreground/90 active:scale-[0.98] transition-all"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link to="/auth" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
                Log in
              </Link>
              <Link
                to="/score"
                className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[13px] font-semibold hover:bg-foreground/90 active:scale-[0.98] transition-all"
              >
                Calculate your score
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}