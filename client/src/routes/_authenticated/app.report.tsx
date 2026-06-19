import { createFileRoute } from "@tanstack/react-router";

import { useState } from "react";
import { generateReport } from "@/lib/report.functions";
import { Disclaimer } from "@/components/maal/Disclaimer";

export const Route = createFileRoute("/_authenticated/app/report")({
  component: ReportPage,
});

function ReportPage() {
  const gen = generateReport;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

  async function build() {
    setBusy(true); setError(null);
    try {
      const { filename, base64 } = await gen();
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setLastFile(filename);
    } catch (e: any) {
      setError(e?.message ?? "Could not generate report.");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Report</p>
      <h1 className="text-[28px] tracking-display font-bold leading-tight mb-1">Your CFO report, in one PDF.</h1>
      <p className="text-[13px] text-muted-foreground mb-8">
        A clean snapshot of your Maal Score, retirement outlook, asset register, and a 5-step action plan.
      </p>

      <div className="p-6 border border-border rounded-[12px] bg-[var(--surface)]">
        <ul className="space-y-2 text-[13px] mb-6">
          <li className="flex items-center gap-2"><Tick /> Maal Score, pillar breakdown, net worth</li>
          <li className="flex items-center gap-2"><Tick /> Retirement projection vs ASFA target</li>
          <li className="flex items-center gap-2"><Tick /> Itemised assets & debts statement</li>
          <li className="flex items-center gap-2"><Tick /> 5-step prioritised action plan</li>
        </ul>
        <button
          onClick={build}
          disabled={busy}
          className="bg-foreground text-background px-5 py-2.5 rounded-[8px] text-[13px] font-semibold disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate PDF report"}
        </button>
        {lastFile && (
          <p className="mt-4 text-[12px] text-[var(--mint)]">Downloaded {lastFile}</p>
        )}
        {error && <p className="mt-4 text-[12px] text-[var(--gold)]">{error}</p>}
      </div>

      <div className="mt-10"><Disclaimer variant="inline" /></div>
    </div>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-[var(--mint)]"><path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}