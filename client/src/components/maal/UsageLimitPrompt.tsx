import { Link } from "@tanstack/react-router";

export function UsageLimitPrompt({ message }: { message: string }) {
  return (
    <div role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[8px] border border-border bg-secondary px-3 py-2.5 text-[13px] text-foreground">
      <p>{message}</p>
      <Link to="/app/billing" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">View Plan &amp; Usage</Link>
    </div>
  );
}
