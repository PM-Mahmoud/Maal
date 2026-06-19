import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/maal/SiteHeader";
import { SiteFooter } from "@/components/maal/SiteFooter";
import { supabase } from "@/integrations/api";
import { toast } from "sonner";

export const Route = createFileRoute("/waitlist")({
  head: () => ({
    meta: [
      { title: "Join the waitlist — Maal" },
      { name: "description", content: "Be first to use Maal — a CFO-level financial clarity platform for every Australian." },
      { property: "og:title", content: "Join the waitlist — Maal" },
      { property: "og:description", content: "Be first to use Maal — financial clarity for every Australian." },
    ],
  }),
  component: WaitlistPage,
});

function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("waitlist").insert({ email: email.trim().toLowerCase(), source: "landing_waitlist" });
    setLoading(false);
    if (error) {
      if (error.code === "23505") {
        setDone(true);
        toast.success("You're already on the list.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    setDone(true);
    toast.success("You're in. We'll be in touch.");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center">
        <div className="max-w-xl mx-auto px-6 py-20 w-full">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Waitlist</p>
          <h1 className="text-[40px] md:text-[52px] tracking-display font-bold leading-[1.05]">
            Be first to use Maal.
          </h1>
          <p className="mt-5 text-[15px] text-muted-foreground leading-relaxed">
            We're opening access in waves. Drop your email and we'll send your invite when your wave goes live.
          </p>

          {done ? (
            <div className="mt-8 p-6 rounded-[12px] border border-[var(--mint)]/30 bg-[var(--mint)]/5">
              <p className="text-[14px] font-semibold">You're on the list.</p>
              <p className="text-[13px] text-muted-foreground mt-1">We'll email you the moment your invite is ready.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 h-11 px-3.5 rounded-[8px] border border-border bg-[var(--surface)] text-[14px] focus:outline-none focus:border-foreground"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-11 px-5 rounded-[8px] bg-foreground text-background text-[13px] font-semibold disabled:opacity-50 hover:bg-foreground/90"
              >
                {loading ? "Joining…" : "Join waitlist"}
              </button>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}