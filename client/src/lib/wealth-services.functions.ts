import { handleUnauthenticated } from "@/integrations/api";

async function request(path:string,init?:RequestInit){const response=await fetch(path,{credentials:"include",...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});if(response.status===401)handleUnauthenticated();const body=await response.json();if(!response.ok)throw new Error(body.error||"Wealth service request failed");return body;}
export const listServiceRuns=(service:string)=>request(`/api/v1/service-runs?service=${encodeURIComponent(service)}`);
export const createZakatRun=(body:unknown)=>request("/api/v1/zakat/runs",{method:"POST",body:JSON.stringify(body)});
export const listPurificationObligations=()=>request("/api/v1/purification/obligations");
export const createPurificationRun=(body:unknown)=>request("/api/v1/purification/runs",{method:"POST",body:JSON.stringify(body)});
export const satisfyPurificationObligation=(id:string)=>request(`/api/v1/purification/obligations/${id}/satisfy`,{method:"POST",body:"{}"});
export const getMarketplace=()=>request("/api/v1/marketplace");
