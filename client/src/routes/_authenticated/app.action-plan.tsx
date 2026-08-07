import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { listRecommendationActions, measureRecommendationOutcome, refreshRecommendationActions, updateRecommendationAction, type RecommendationAction } from "@/lib/recommendation-actions.functions";

export const Route = createFileRoute("/_authenticated/app/action-plan")({ component: ActionPlanPage });

function ActionPlanPage() {
  const [actions, setActions] = useState<RecommendationAction[]>([]);
  const [loading, setLoading] = useState(true);
  async function load(refresh = false) {
    setLoading(true);
    try { setActions(await (refresh ? refreshRecommendationActions() : listRecommendationActions())); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load actions"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function transition(action: RecommendationAction, status: RecommendationAction["status"]) {
    try { await updateRecommendationAction(action.id, status); await load(); toast.success(status === "completed" ? "Action completed and outcome measured" : "Action updated"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update action"); }
  }
  async function checkIn(action: RecommendationAction) {
    try { await measureRecommendationOutcome(action.id); await load(); toast.success("Outcome check-in recorded"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not measure outcome"); }
  }
  return <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.14em] text-mint">Build 7 · Recommendations</p><h1 className="mt-1 text-[32px] font-bold tracking-display">Action plan</h1><p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">Actions ranked by expected impact, urgency, evidence confidence and effort. Complete an action to capture its measured financial-health outcome.</p></div>
      <Button variant="outline" onClick={() => load(true)} disabled={loading}><RefreshCw className="mr-2 size-4" />Refresh from my score</Button>
    </div>
    {loading && !actions.length ? <p className="mt-8 text-sm text-muted-foreground">Loading your action plan…</p> : !actions.length ? <Card className="mt-8 border-dashed p-8 text-center"><Target className="mx-auto size-6 text-mint" /><p className="mt-3 text-sm font-medium">No ranked actions yet</p><p className="mt-1 text-xs text-muted-foreground">Refresh from your Maal Score to create an evidence-based plan.</p></Card> : <div className="mt-8 space-y-4">{actions.map((action, index) => <Card key={action.id} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-mint/15 text-xs font-bold text-mint">{index + 1}</span><h2 className="font-semibold">{action.title}</h2><Status status={action.status} /></div><p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{action.description}</p></div><p className="text-right text-xs"><b className="text-lg tabular-nums">{Number(action.rank_score)}</b><span className="block text-muted-foreground">ranking score</span></p></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Impact",action.impact_score],["Urgency",action.urgency_score],["Confidence",action.confidence_score],["Effort",action.effort_score]].map(([label,value])=><div key={String(label)} className="rounded-lg bg-secondary/60 p-2 text-center"><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}/5</p></div>)}</div>
      <details className="mt-3 text-[11px] text-muted-foreground"><summary className="cursor-pointer text-mint">Why this rank?</summary><p className="mt-2 font-mono">{action.ranking.formula}</p>{action.target&&<p className="mt-1">Baseline: {action.baseline.value ?? "unavailable"} {action.baseline.unit} · Target {action.target.operator} {action.target.value} {action.target.unit}</p>}</details>
      <div className="mt-4 flex flex-wrap gap-2">{action.status === "pending" && <Button size="sm" onClick={() => transition(action,"in_progress")}>Start action</Button>}{["pending","in_progress"].includes(action.status)&&<Button size="sm" variant="outline" onClick={() => transition(action,"completed")}><CheckCircle2 className="mr-1.5 size-3.5" />Complete</Button>}{action.status === "in_progress"&&<Button size="sm" variant="ghost" onClick={() => transition(action,"pending")}>Pause</Button>}{action.status !== "completed"&&action.status!=="dismissed"&&<Button size="sm" variant="ghost" onClick={() => transition(action,"dismissed")}>Dismiss</Button>}{action.status === "dismissed"&&<Button size="sm" variant="outline" onClick={() => transition(action,"pending")}>Restore</Button>}{action.status === "completed"&&<Button size="sm" variant="outline" onClick={() => checkIn(action)}>Measure again</Button>}</div>
      {action.outcomes.length>0&&<div className="mt-4 border-t border-border pt-3"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Measured outcomes</p>{action.outcomes.map(outcome=><p key={outcome.id} className="mt-2 text-xs"><span className="font-medium">{Number(outcome.value)} {outcome.unit}</span>{outcome.delta!=null&&<span className={Number(outcome.delta)>=0?"text-emerald-500":"text-amber-500"}> · {Number(outcome.delta)>=0?"+":""}{Number(outcome.delta)} improvement</span>}<span className={outcome.target_met?"text-emerald-500":"text-muted-foreground"}> · {outcome.target_met?"Target met":"Target not yet met"}</span><span className="text-muted-foreground"> · {new Date(outcome.measured_at).toLocaleDateString("en-AU")}</span></p>)}</div>}
    </Card>)}</div>}
    <div className="mt-10"><Disclaimer variant="inline" /></div>
  </div>;
}
function Status({ status }: { status: RecommendationAction["status"] }) { return <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] capitalize text-muted-foreground">{status.replace("_", " ")}</span>; }
