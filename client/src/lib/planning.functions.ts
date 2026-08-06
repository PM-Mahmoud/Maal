export type PlanningSummary = {
  as_of:string;
  goals:Array<{goal_id:string;name:string;remaining_amount:number;required_monthly_contribution:number|null;monthly_shortfall:number|null;status:string}>;
  emergency_fund:{coverage_months:number|null;target_months:number;target_amount:number;gap:number;funded_pct:number|null;status:string};
  debt_plans:Array<{strategy:string;starting_balance:number;total_interest:number;months_to_debt_free:number|null;debt_free_date:string|null;payoff_order:Array<{id:string;label:string;payoff_month:number|null}>}>;
  outcomes:{goals_on_track:number;goals_total:number;emergency_fund_gap:number;projected_debt_free_date:string|null;recommended_debt_strategy:string|null};
};
export async function previewPlanning():Promise<PlanningSummary>{const r=await fetch('/api/v1/planning',{credentials:'include'});if(!r.ok)throw new Error('Could not calculate your plan');return r.json();}
export async function savePlanning(config:unknown):Promise<unknown>{const r=await fetch('/api/v1/planning',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});if(!r.ok)throw new Error('Could not save your plan');return r.json();}
export async function planningHistory():Promise<unknown[]>{const r=await fetch('/api/v1/planning/history',{credentials:'include'});if(!r.ok)throw new Error('Could not load plan history');return r.json();}
