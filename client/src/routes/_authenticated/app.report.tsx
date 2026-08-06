import { createFileRoute } from "@tanstack/react-router";

import { useState } from "react";
import { generateReport, emailDataFile } from "@/lib/report.functions";
import { Disclaimer } from "@/components/maal/Disclaimer";

const DATASETS = [
  { v: "net_worth", label: "Net worth history" },
  { v: "balances", label: "Balance summary" },
  { v: "transactions", label: "Transactions" },
  { v: "goals", label: "Goals" },
] as const;
const FILE_TYPES = [
  { v: "csv", label: "CSV" },
  { v: "excel", label: "Excel" },
] as const;

export const Route = createFileRoute("/_authenticated/app/report")({
  component: ReportPage,
});

function ReportPage() {
  const gen = generateReport;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [closeMonth, setCloseMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  async function createClose() {
    setBusy(true); setError(null); setCloseMsg(null);
    try {
      const response = await fetch(`/api/v1/monthly-closes/${closeMonth}`, { method: "POST", credentials: "include" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not close the month.");
      setCloseMsg(`${body.month} closed · ${String(body.payload_hash).slice(0, 12)}…`);
    } catch (e: any) { setError(e?.message ?? "Could not close the month."); }
    finally { setBusy(false); }
  }

  async function build() {
    setBusy(true); setError(null); setLastFile(null);
    try {
      const res = await gen();
      if (!res || typeof res.filename !== "string" || typeof res.base64 !== "string") {
        throw new Error("The report response was malformed — please try again.");
      }
      const { filename, base64 } = res;
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

  // Email-a-data-file (PR 11)
  const [dataset, setDataset] = useState<string>("net_worth");
  const [fileType, setFileType] = useState<string>("csv");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  async function emailFile() {
    setEmailBusy(true); setEmailMsg(null); setEmailErr(null);
    try {
      const { emailedTo, filename } = await emailDataFile(fileType, dataset);
      setEmailMsg(`Sent ${filename} to ${emailedTo}.`);
    } catch (e: any) {
      // 402 usage_limit carries an upgrade prompt as its message — surface it as-is.
      setEmailErr(e?.message ?? "Could not generate the file.");
    } finally { setEmailBusy(false); }
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

      <div className="mt-6 p-6 border border-border rounded-[12px] bg-[var(--surface)]">
        <h2 className="text-[16px] font-bold tracking-display mb-1">Monthly financial close</h2>
        <p className="text-[13px] text-muted-foreground mb-4">Create an immutable record of balances, cash flow, reconciliation exceptions, and investment performance.</p>
        <div className="flex items-end gap-3">
          <label><span className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Month</span><input type="month" value={closeMonth} onChange={(e) => setCloseMonth(e.target.value)} className="px-3 py-2 border border-border rounded-[8px] bg-background text-[13px]" /></label>
          <button onClick={createClose} disabled={busy} className="px-5 py-2.5 rounded-[8px] border border-border bg-background text-[13px] font-semibold disabled:opacity-40">Close month</button>
        </div>
        {closeMsg && <p className="mt-3 text-[12px] text-[var(--mint)]">{closeMsg}</p>}
      </div>

      {/* Email a data file (Pro/Max) */}
      <div className="mt-6 p-6 border border-border rounded-[12px] bg-[var(--surface)]">
        <h2 className="text-[16px] font-bold tracking-display mb-1">Email me my data as a file</h2>
        <p className="text-[13px] text-muted-foreground mb-5">
          Built from your own Maal data and sent to your inbox. Pro & Max plans.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Data</span>
            <select value={dataset} onChange={(e) => setDataset(e.target.value)}
              className="px-3 py-2 border border-border rounded-[8px] bg-background text-[13px]">
              {DATASETS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Format</span>
            <select value={fileType} onChange={(e) => setFileType(e.target.value)}
              className="px-3 py-2 border border-border rounded-[8px] bg-background text-[13px]">
              {FILE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </label>
          <button
            onClick={emailFile}
            disabled={emailBusy}
            className="px-5 py-2.5 rounded-[8px] border border-border bg-background hover:border-foreground text-[13px] font-semibold disabled:opacity-40"
          >
            {emailBusy ? "Sending…" : "Email me this file"}
          </button>
        </div>
        {emailMsg && <p className="mt-4 text-[12px] text-[var(--mint)]">{emailMsg}</p>}
        {emailErr && <p className="mt-4 text-[12px] text-[var(--gold)]">{emailErr}</p>}
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
