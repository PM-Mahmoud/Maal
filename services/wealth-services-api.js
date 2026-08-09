'use strict';

const { calculateZakat, canonicalZakatLines, METHODOLOGIES } = require('../lib/zakat');
const { calculatePurification, METHODOLOGY } = require('../lib/purification');
const { snapshotHash, evidenceDocument } = require('../lib/service-evidence');
const runs = require('../db/wealth-services');
const partners = require('../db/partner-platform');

function userId(req,res){if(!req.session?.userId){res.status(401).json({error:'Not authenticated'});return null;}return req.session.userId;}
function fail(res,error){if(error.code&&String(error.code).length===5){console.error('wealth service database error:',error.message);return res.status(500).json({error:'An internal error occurred'});}res.status(error.statusCode||400).json({error:error.message});}

async function calculateZakatHandler(req,res){const uid=userId(req,res);if(!uid)return;try{
  const base=METHODOLOGIES[req.body.methodology || 'LUNAR_V1']; if(!base) throw new Error('Unsupported zakat methodology');
  const pack=await runs.getMethodology('zakat',base.id,base.version);if(!pack)throw new Error('Zakat methodology pack is not installed');
  const methodology={...base,...pack.config,reviewStatus:pack.status};
  let lines=req.body.lines;
  if(!Array.isArray(lines)){const canonical=await require('../db/canonical-wealth').getCanonicalSnapshot(uid);lines=canonicalZakatLines(canonical);}
  const snapshot={valuationDate:req.body.valuationDate,nisabMinor:req.body.nisabMinor,lines};
  const result=calculateZakat({...snapshot,methodology});
  const remindAt=new Date(`${req.body.valuationDate}T00:00:00Z`);remindAt.setUTCFullYear(remindAt.getUTCFullYear()+1);
  const run=await runs.createRun(uid,{serviceType:'zakat',methodologyKey:methodology.id,methodologyVersion:methodology.version,methodologyReviewStatus:methodology.reviewStatus,snapshot,snapshotHash:snapshotHash(snapshot),result,status:result.status,lines:result.lines,remindAt});
  res.status(201).json({...result,runId:run.id,activationGate:methodology.reviewStatus==='approved'?null:'qualified_methodology_review_required'});
}catch(e){fail(res,e);}}

async function calculatePurificationHandler(req,res){const uid=userId(req,res);if(!uid)return;try{
  const pack=await runs.getMethodology('purification',METHODOLOGY.id,METHODOLOGY.version);if(!pack)throw new Error('Purification methodology pack is not installed');
  const methodology={...METHODOLOGY,...pack.config,reviewStatus:pack.status};
  const supplied=req.body.positions||[],ratioMap=await runs.licensedRatios(supplied.map(p=>p.securityKey).filter(Boolean),req.body.periodEnd);
  const positions=supplied.map(({ratio:_ignored,...position})=>({...position,ratio:ratioMap.get(position.securityKey)}));
  const snapshot={periodStart:req.body.periodStart,periodEnd:req.body.periodEnd,positions};
  const result=calculatePurification({...snapshot,methodology});
  const run=await runs.createRun(uid,{serviceType:'purification',methodologyKey:methodology.id,methodologyVersion:methodology.version,methodologyReviewStatus:methodology.reviewStatus,snapshot,snapshotHash:snapshotHash(snapshot),result,status:result.status,lines:result.lines,obligations:result.obligations});
  res.status(201).json({...result,runId:run.id,activationGate:methodology.reviewStatus==='approved'?null:'qualified_methodology_review_required'});
}catch(e){fail(res,e);}}
async function zakatPrefillHandler(req,res){const uid=userId(req,res);if(!uid)return;try{const canonical=await require('../db/canonical-wealth').getCanonicalSnapshot(uid);res.json({lines:canonicalZakatLines(canonical),source:'canonical_wealth',requiresConfirmation:true});}catch(e){fail(res,e);}}

async function listRunsHandler(req,res){const uid=userId(req,res);if(!uid)return;try{res.json({runs:await runs.listRuns(uid,req.query.service)});}catch(e){fail(res,e);}}
async function evidenceHandler(req,res){const uid=userId(req,res);if(!uid)return;try{const run=await runs.getRun(uid,req.params.id);if(!run)return res.status(404).json({error:'Run not found'});res.setHeader('Content-Disposition',`attachment; filename="${run.service_type}-${run.id}-evidence.json"`);res.json(evidenceDocument(run));}catch(e){fail(res,e);}}
async function obligationsHandler(req,res){const uid=userId(req,res);if(!uid)return;try{res.json({obligations:await runs.listObligations(uid)});}catch(e){fail(res,e);}}
async function satisfyHandler(req,res){const uid=userId(req,res);if(!uid)return;try{res.json(await runs.satisfyObligation(uid,req.params.id,req.body.evidence||{}));}catch(e){fail(res,e);}}
async function marketplaceHandler(req,res){if(!userId(req,res))return;try{res.json(await partners.marketplace());}catch(e){fail(res,e);}}
async function consentHandler(req,res){const uid=userId(req,res);if(!uid)return;try{res.status(201).json(await partners.grantConsent(uid,req.params.partnerKey,req.body));}catch(e){fail(res,e);}}
async function consentsHandler(req,res){const uid=userId(req,res);if(!uid)return;try{res.json({consents:await partners.listConsents(uid)});}catch(e){fail(res,e);}}
async function revokeHandler(req,res){const uid=userId(req,res);if(!uid)return;try{res.json(await partners.revokeConsent(uid,req.params.id));}catch(e){fail(res,e);}}
function adminUser(req,res){const uid=userId(req,res);if(!uid)return null;const allowed=String(process.env.PARTNER_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);if(!allowed.includes(String(uid))){res.status(403).json({error:'Partner administrator access required'});return null;}return uid;}
async function partnerManifestHandler(req,res){const uid=adminUser(req,res);if(!uid)return;try{res.status(201).json(await partners.upsertPartner(uid,req.body));}catch(e){fail(res,e);}}
async function partnerApprovalHandler(req,res){const uid=adminUser(req,res);if(!uid)return;try{res.json(await partners.setPartnerApproval(uid,req.params.partnerKey,req.body.approved===true,req.body.enabled===true));}catch(e){fail(res,e);}}
async function governanceHandler(req,res){const uid=adminUser(req,res);if(!uid)return;try{if(req.body.approved===true&&!req.body.commercialTermsVersion)throw new Error('Commercial terms version is required for marketplace approval');res.json(await partners.setGovernance(uid,req.body.approved===true,req.body.commercialTermsVersion));}catch(e){fail(res,e);}}
async function methodologyApprovalHandler(req,res){const uid=adminUser(req,res);if(!uid)return;try{if(!req.body.reviewerName||!Array.isArray(req.body.sources)||!req.body.sources.length)throw new Error('Qualified reviewer name and sources are required');const row=(await require('../db/pool').query(`UPDATE methodology_packs SET status='approved',reviewer_name=$1,reviewed_at=NOW(),sources=$2 WHERE service_type=$3 AND methodology_key=$4 AND version=$5 RETURNING *`,[req.body.reviewerName,req.body.sources,req.params.serviceType,req.params.key,req.params.version])).rows[0];if(!row)return res.status(404).json({error:'Methodology pack not found'});res.json(row);}catch(e){fail(res,e);}}
async function ratioDatasetHandler(req,res){const uid=adminUser(req,res);if(!uid)return;try{const b=req.body;if(!b.securityKey||!Number.isInteger(b.partsPerMillion)||!b.provider||!b.datasetVersion||!b.licenseReference||!b.asOf)throw new Error('Complete licensed ratio provenance is required');const row=(await require('../db/pool').query(`INSERT INTO purification_ratio_datasets(security_key,ratio_parts_per_million,provider,dataset_version,license_reference,ratio_as_of,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(security_key,dataset_version) DO UPDATE SET ratio_parts_per_million=EXCLUDED.ratio_parts_per_million,provider=EXCLUDED.provider,license_reference=EXCLUDED.license_reference,ratio_as_of=EXCLUDED.ratio_as_of,status='active',approved_by=EXCLUDED.approved_by RETURNING *`,[b.securityKey,b.partsPerMillion,b.provider,b.datasetVersion,b.licenseReference,b.asOf,uid])).rows[0];res.status(201).json(row);}catch(e){fail(res,e);}}
async function sandboxCertificationHandler(req,res){const uid=adminUser(req,res);if(!uid)return;try{if(!req.body.evidence)throw new Error('Sandbox certification evidence is required');res.json(await partners.certifySandbox(uid,req.params.partnerKey,req.body.certified===true,req.body.evidence));}catch(e){fail(res,e);}}

module.exports={calculateZakatHandler,zakatPrefillHandler,calculatePurificationHandler,listRunsHandler,evidenceHandler,obligationsHandler,satisfyHandler,marketplaceHandler,consentHandler,consentsHandler,revokeHandler,partnerManifestHandler,partnerApprovalHandler,governanceHandler,methodologyApprovalHandler,ratioDatasetHandler,sandboxCertificationHandler};
